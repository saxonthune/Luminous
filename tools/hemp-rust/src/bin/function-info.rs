//! Ordered source structure for a single-function visual experiment; not a CFG.
use proc_macro2::Span;
use quote::ToTokens;
use serde_json::{json, Value};
use syn::{spanned::Spanned, visit::{self, Visit}, Expr, Stmt};

struct Extract { serial: usize }
impl Extract {
    fn node(&mut self, kind: &str, label: String, span: Span, children: Vec<Value>) -> Value {
        self.serial += 1;
        json!({"id":format!("part:{}", self.serial), "kind":kind, "label":label,
            "start":{"line":span.start().line,"column":span.start().column + 1},
            "end":{"line":span.end().line,"column":span.end().column + 1}, "children":children})
    }
    fn block(&mut self, block: &syn::Block) -> Vec<Value> {
        block.stmts.iter().map(|stmt| match stmt {
            Stmt::Local(local) => {
                let mut children = Vec::new();
                if let Some(init) = &local.init {
                    children.push(self.expr(&init.expr));
                    if let Some((_, diverge)) = &init.diverge {
                        let child = self.expr(diverge);
                        children.push(self.node("else", "else".into(), diverge.span(), vec![child]));
                    }
                }
                self.node("binding", format!("let {}", local.pat.to_token_stream()), local.span(), children)
            }
            Stmt::Expr(expr, _) => self.expr(expr),
            Stmt::Item(item) => self.node("item", item.to_token_stream().to_string(), item.span(), vec![]),
            Stmt::Macro(mac) => self.node("macro", mac.to_token_stream().to_string(), mac.span(), vec![]),
        }).collect()
    }
    fn expr(&mut self, expr: &Expr) -> Value {
        let mut children = Vec::new();
        let (kind, label) = match expr {
            Expr::Block(b) => { children = self.block(&b.block); ("block", "block".into()) }
            Expr::If(i) => {
                let condition = self.expr(&i.cond);
                children.push(self.node("condition", "condition".into(), i.cond.span(), vec![condition]));
                let body = self.block(&i.then_branch);
                children.push(self.node("then", "then".into(), i.then_branch.span(), body));
                if let Some((_, other)) = &i.else_branch {
                    let body = self.expr(other);
                    children.push(self.node("else", "else".into(), other.span(), vec![body]));
                }
                ("if", "if".into())
            }
            Expr::Match(m) => {
                children.push(self.expr(&m.expr));
                for arm in &m.arms {
                    let mut parts = Vec::new();
                    if let Some((_, guard)) = &arm.guard {
                        let value = self.expr(guard);
                        parts.push(self.node("guard", "guard".into(), guard.span(), vec![value]));
                    }
                    parts.push(self.expr(&arm.body));
                    children.push(self.node("arm", arm.pat.to_token_stream().to_string(), arm.span(), parts));
                }
                ("match", "match".into())
            }
            Expr::ForLoop(f) => {
                children.push(self.expr(&f.expr));
                children.extend(self.block(&f.body));
                ("loop", format!("for {} in", f.pat.to_token_stream()))
            }
            Expr::While(w) => {
                children.push(self.expr(&w.cond)); children.extend(self.block(&w.body));
                ("loop", "while".into())
            }
            Expr::Loop(l) => { children = self.block(&l.body); ("loop", "loop".into()) }
            Expr::Call(c) => {
                children = c.args.iter().map(|arg| self.expr(arg)).collect();
                ("call", c.func.to_token_stream().to_string())
            }
            Expr::MethodCall(c) => {
                children.push(self.expr(&c.receiver));
                children.extend(c.args.iter().map(|arg| self.expr(arg)));
                ("method", c.method.to_string())
            }
            Expr::Closure(c) => {
                children.push(self.expr(&c.body));
                ("closure", format!("|{}| (deferred body)", c.inputs.to_token_stream()))
            }
            Expr::Return(r) => {
                if let Some(value) = &r.expr { children.push(self.expr(value)); }
                ("return", "return".into())
            }
            Expr::Try(t) => { children.push(self.expr(&t.expr)); ("try", "? · propagate error".into()) }
            Expr::Assign(a) => {
                children.push(self.expr(&a.left)); children.push(self.expr(&a.right));
                ("assign", "=".into())
            }
            Expr::Binary(b) => {
                children.push(self.expr(&b.left)); children.push(self.expr(&b.right));
                ("operator", b.op.to_token_stream().to_string())
            }
            // Preserve the source for other expressions instead of inventing semantics.
            _ => ("expression", expr.to_token_stream().to_string()),
        };
        self.node(kind, label, expr.span(), children)
    }
}
struct Find<'a> { name: &'a str, found: Vec<Value> }
impl<'ast> Visit<'ast> for Find<'_> {
    fn visit_item_fn(&mut self, function: &'ast syn::ItemFn) {
        if self.name == "*" || function.sig.ident == self.name {
            let mut extract = Extract { serial: 0 };
            self.found.push(json!({"name":function.sig.ident.to_string(), "signature":function.sig.to_token_stream().to_string(),
                "lineCount":function.span().end().line - function.span().start().line + 1,
                "definitionLine":function.sig.ident.span().start().line,
                "body":extract.block(&function.block)}));
        }
        visit::visit_item_fn(self, function);
    }
    fn visit_impl_item_fn(&mut self, function: &'ast syn::ImplItemFn) {
        if self.name == "*" {
            let mut extract = Extract { serial: 0 };
            self.found.push(json!({"name":function.sig.ident.to_string(), "signature":function.sig.to_token_stream().to_string(),
                "lineCount":function.span().end().line - function.span().start().line + 1,
                "definitionLine":function.sig.ident.span().start().line,
                "body":extract.block(&function.block)}));
        }
        visit::visit_impl_item_fn(self, function);
    }
    fn visit_trait_item_fn(&mut self, function: &'ast syn::TraitItemFn) {
        if self.name == "*" {
            if let Some(block) = &function.default {
                let mut extract = Extract { serial: 0 };
                self.found.push(json!({"name":function.sig.ident.to_string(), "signature":function.sig.to_token_stream().to_string(),
                    "lineCount":function.span().end().line - function.span().start().line + 1,
                    "definitionLine":function.sig.ident.span().start().line,
                    "body":extract.block(block)}));
            }
        }
        visit::visit_trait_item_fn(self, function);
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 { return Err("usage: function-info SOURCE FUNCTION".into()); }
    let file = syn::parse_file(&std::fs::read_to_string(&args[1])?)?;
    let mut finder = Find { name: &args[2], found: Vec::new() };
    finder.visit_file(&file);
    if args[2] == "*" { println!("{}", json!(finder.found)); }
    else {
        if finder.found.len() != 1 { return Err("expected exactly one matching free function".into()); }
        println!("{}", finder.found[0]);
    }
    Ok(())
}
