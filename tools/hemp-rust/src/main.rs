//! Syntax-based Rust inventory. Cargo supplies workspace identity; syn supplies modules/imports.
use quote::ToTokens;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};
use syn::{Attribute, Item, UseTree, spanned::Spanned, visit::Visit};

#[derive(Clone)]
struct Import {
    owner: String,
    path: Vec<String>,
    file: String,
    line: usize,
}
struct Inventory {
    nodes: Vec<Value>,
    imports: Vec<Import>,
    warnings: Vec<String>,
    root: PathBuf,
}
fn docs(attrs: &[Attribute]) -> String {
    attrs
        .iter()
        .filter_map(|a| {
            if !a.path().is_ident("doc") {
                return None;
            }
            if let syn::Meta::NameValue(n) = &a.meta {
                if let syn::Expr::Lit(l) = &n.value {
                    if let syn::Lit::Str(s) = &l.lit {
                        return Some(s.value().trim().to_string());
                    }
                }
            }
            None
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
fn imports(tree: &UseTree, prefix: Vec<String>, out: &mut Vec<Vec<String>>) {
    match tree {
        UseTree::Path(p) => {
            let mut v = prefix;
            v.push(p.ident.to_string());
            imports(&p.tree, v, out);
        }
        UseTree::Group(g) => {
            for t in &g.items {
                imports(t, prefix.clone(), out);
            }
        }
        UseTree::Name(n) => {
            let mut v = prefix;
            v.push(n.ident.to_string());
            out.push(v);
        }
        UseTree::Rename(n) => {
            let mut v = prefix;
            v.push(n.ident.to_string());
            out.push(v);
        }
        UseTree::Glob(_) => out.push(prefix),
    }
}
struct Uses<'a> {
    owner: &'a str,
    file: &'a str,
    output: &'a mut Vec<Import>,
}
impl<'ast> Visit<'ast> for Uses<'_> {
    fn visit_item_mod(&mut self, _: &'ast syn::ItemMod) {} // Each module has its own owner.
    fn visit_item_use(&mut self, u: &'ast syn::ItemUse) {
        let mut paths = vec![];
        imports(&u.tree, vec![], &mut paths);
        for path in paths {
            self.output.push(Import {
                owner: self.owner.into(),
                path,
                file: self.file.into(),
                line: u.span().start().line,
            });
        }
    }
}
impl Inventory {
    fn relative(&self, p: &Path) -> String {
        p.strip_prefix(&self.root)
            .unwrap_or(p)
            .to_string_lossy()
            .replace('\\', "/")
    }
    fn file(
        &mut self,
        file: &Path,
        dir: &Path,
        owner: &str,
        stack: &mut BTreeSet<PathBuf>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let canonical = fs::canonicalize(file)
            .map_err(|error| format!("Cannot resolve Rust source {}: {error}", file.display()))?;
        if !stack.insert(canonical.clone()) {
            self.warnings
                .push(format!("Recursive module file: {}", file.display()));
            return Ok(());
        }
        let source = fs::read_to_string(file)
            .map_err(|error| format!("Cannot read Rust source {}: {error}", file.display()))?;
        let parsed = syn::parse_file(&source)
            .map_err(|error| format!("Cannot parse Rust source {}: {error}", file.display()))?;
        let description = docs(&parsed.attrs);
        if !description.is_empty() {
            if let Some(n) = self.nodes.iter_mut().find(|n| n["id"] == owner) {
                n["description"] = json!(description);
            }
        }
        self.items(&parsed.items, file, dir, owner, stack)?;
        stack.remove(&canonical);
        Ok(())
    }
    fn items(
        &mut self,
        items: &[Item],
        file: &Path,
        dir: &Path,
        owner: &str,
        stack: &mut BTreeSet<PathBuf>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let rel = self.relative(file);
        let mut visitor = Uses {
            owner,
            file: &rel,
            output: &mut self.imports,
        };
        for item in items {
            visitor.visit_item(item);
        }
        for item in items {
            if let Item::Mod(m) = item {
                if m.attrs.iter().any(|a| {
                    a.path().is_ident("cfg") && a.meta.to_token_stream().to_string() == "cfg (test)"
                }) {
                    continue;
                }
                let name = m.ident.to_string();
                let id = format!("{owner}::{name}");
                let cfg: Vec<_> = m
                    .attrs
                    .iter()
                    .filter(|a| a.path().is_ident("cfg") || a.path().is_ident("cfg_attr"))
                    .map(|a| a.meta.to_token_stream().to_string())
                    .collect();
                self.nodes.push(json!({"id":id,"name":name,"kind":"module","parent":owner,"source":{"file":rel,"line":m.span().start().line},"description":docs(&m.attrs),"cfg":cfg}));
                if let Some((_, children)) = &m.content {
                    self.items(children, file, &dir.join(&name), &id, stack)?;
                } else {
                    let explicit = m.attrs.iter().find_map(|a| {
                        if !a.path().is_ident("path") {
                            return None;
                        }
                        if let syn::Meta::NameValue(n) = &a.meta {
                            if let syn::Expr::Lit(l) = &n.value {
                                if let syn::Lit::Str(s) = &l.lit {
                                    return Some(s.value());
                                }
                            }
                        }
                        None
                    });
                    let child = if let Some(p) = explicit {
                        dir.join(p)
                    } else if dir.join(format!("{name}.rs")).exists() {
                        dir.join(format!("{name}.rs"))
                    } else {
                        dir.join(&name).join("mod.rs")
                    };
                    if child.exists() {
                        let child_dir = if child.file_name().unwrap() == "mod.rs" {
                            child.parent().unwrap().to_path_buf()
                        } else {
                            child.with_extension("")
                        };
                        let source = json!({"file":self.relative(&child),"line":1});
                        self.nodes.last_mut().unwrap()["source"] = source;
                        self.file(&child, &child_dir, &id, stack)?;
                    } else {
                        self.warnings.push(format!(
                            "Module source unavailable: {id} ({})",
                            child.display()
                        ));
                    }
                }
            }
        }
        Ok(())
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = env::args().nth(1).ok_or("Expected Cargo.toml path")?;
    let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let result = Command::new(&cargo)
        .args([
            "metadata",
            "--format-version",
            "1",
            "--no-deps",
            "--manifest-path",
            &manifest,
        ])
        .output()
        .map_err(|error| format!("Cannot run {:?} metadata for {manifest}: {error}", cargo))?;
    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).into_owned().into());
    }
    let meta: Value = serde_json::from_slice(&result.stdout)?;
    let root = PathBuf::from(
        meta["workspace_root"]
            .as_str()
            .ok_or("Missing workspace root")?,
    );
    let mut inv = Inventory {
        nodes: vec![],
        imports: vec![],
        warnings: vec![],
        root,
    };
    let packages = meta["packages"].as_array().ok_or("Missing packages")?;
    let mut libs = BTreeMap::new();
    let mut roots = vec![];
    for p in packages {
        for t in p["targets"].as_array().unwrap() {
            let kinds = t["kind"].as_array().unwrap();
            let lib = kinds.iter().any(|k| {
                ["lib", "rlib", "proc-macro", "cdylib", "staticlib", "dylib"]
                    .iter()
                    .any(|v| k == v)
            });
            if !lib && !kinds.iter().any(|k| k == "bin") {
                continue;
            }
            let name = t["name"].as_str().unwrap();
            let id = format!(
                "{}:{}:{name}",
                p["name"].as_str().unwrap(),
                if lib { "lib" } else { "bin" }
            );
            if lib {
                libs.insert(p["name"].as_str().unwrap().to_string(), id.clone());
            }
            roots.push((id, p, t));
        }
    }
    let mut edges = BTreeMap::<(String, String, String), Value>::new();
    let mut aliases = BTreeMap::<String, BTreeMap<String, String>>::new();
    for (id, p, t) in &roots {
        let file = PathBuf::from(t["src_path"].as_str().unwrap());
        inv.nodes.push(json!({"id":id,"name":p["name"],"kind":"crate","target":t["name"],"targetKind":t["kind"],"description":p["description"].as_str().unwrap_or(""),"source":{"file":inv.relative(&file),"line":1}}));
        let mut names = BTreeMap::new();
        for d in p["dependencies"].as_array().unwrap() {
            if d["kind"] == "dev" || d["kind"] == "build" {
                continue;
            }
            if let Some(target) = libs.get(d["name"].as_str().unwrap()) {
                names.insert(
                    d["rename"]
                        .as_str()
                        .unwrap_or(d["name"].as_str().unwrap())
                        .replace('-', "_"),
                    target.clone(),
                );
                edges.insert((id.clone(),target.clone(),"cargo".into()), json!({"from":id,"to":target,"kind":"cargo","evidence":[{"file":inv.relative(Path::new(p["manifest_path"].as_str().unwrap())),"line":1,"text":format!("Cargo dependency: {}",d["name"].as_str().unwrap())}]}));
            }
        }
        if let Some(lib) = libs.get(p["name"].as_str().unwrap()) {
            names.insert(p["name"].as_str().unwrap().replace('-', "_"), lib.clone());
        }
        aliases.insert(id.clone(), names);
        inv.file(&file, file.parent().unwrap(), id, &mut BTreeSet::new())?;
    }
    let ids: BTreeSet<_> = inv
        .nodes
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_string())
        .collect();
    for i in &inv.imports {
        if i.path.is_empty() {
            continue;
        }
        let crate_id = i.owner.split("::").next().unwrap();
        let first = &i.path[0];
        let (mut base, mut offset) = if first == "crate" {
            (crate_id.to_string(), 1)
        } else if first == "self" {
            (i.owner.clone(), 1)
        } else if first == "super" {
            (i.owner.clone(), 0)
        } else if let Some(target) = aliases[crate_id].get(first) {
            (target.clone(), 1)
        } else {
            (i.owner.clone(), 0)
        };
        while i.path.get(offset).is_some_and(|p| p == "super") {
            base = base
                .rsplit_once("::")
                .map(|p| p.0)
                .unwrap_or(crate_id)
                .to_string();
            offset += 1;
        }
        let mut target = base.clone();
        for part in &i.path[offset..] {
            if part == "self" {
                continue;
            }
            let next = format!("{target}::{part}");
            if !ids.contains(&next) {
                break;
            }
            target = next;
        }
        if target == i.owner || !ids.contains(&target) {
            continue;
        }
        let key = (i.owner.clone(), target.clone(), "import".into());
        let edge = edges
            .entry(key)
            .or_insert_with(|| json!({"from":i.owner,"to":target,"kind":"import","evidence":[]}));
        edge["evidence"]
            .as_array_mut()
            .unwrap()
            .push(json!({"file":i.file,"line":i.line,"text":i.path.join("::")}));
    }
    inv.nodes
        .sort_by_key(|n| n["id"].as_str().unwrap().to_string());
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"version":1,"name":"braincrawl","analysis":{"method":"cargo-metadata + syn imports","scope":"Workspace library/binary targets; normal workspace dependencies; cfg union excluding cfg(test). Imports only: aliases/re-exports, macros and method calls are not semantically resolved.","warnings":inv.warnings},"nodes":inv.nodes,"dependencies":edges.values().collect::<Vec<_>>(),"views":{}})
        )?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_keep_original_alias_target_and_do_not_leak_child_ownership() {
        let file = syn::parse_file(
            "use crate::store::{Reader as R, Writer}; mod child { use crate::hidden::Thing; }",
        )
        .unwrap();
        let mut output = vec![];
        let mut visitor = Uses {
            owner: "root",
            file: "lib.rs",
            output: &mut output,
        };
        for item in &file.items {
            visitor.visit_item(item);
        }
        assert_eq!(output.len(), 2);
        assert_eq!(output[0].path, vec!["crate", "store", "Reader"]);
        assert_eq!(output[1].path, vec!["crate", "store", "Writer"]);
    }

    #[test]
    fn inline_modules_keep_docs_parentage_and_test_exclusion() {
        let file = syn::parse_file(
            "/// Store records.\npub mod store { pub mod nested {} } #[cfg(test)] mod tests {}",
        )
        .unwrap();
        let mut inv = Inventory {
            nodes: vec![],
            imports: vec![],
            warnings: vec![],
            root: PathBuf::from("/fixture"),
        };
        inv.items(
            &file.items,
            Path::new("/fixture/lib.rs"),
            Path::new("/fixture"),
            "root",
            &mut BTreeSet::new(),
        )
        .unwrap();
        assert_eq!(inv.nodes.len(), 2);
        assert_eq!(inv.nodes[0]["description"], "Store records.");
        assert_eq!(inv.nodes[1]["parent"], "root::store");
    }
}
