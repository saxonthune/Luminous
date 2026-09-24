//! Source-shaped function bodies, not a complete control-flow graph.
use proc_macro2::Span;
use quote::ToTokens;
use serde_json::{json, Value};
use syn::{spanned::Spanned, visit::{self, Visit}, Expr};

fn position(span: Span, end: bool) -> Value {
    let p = if end { span.end() } else { span.start() };
    json!({"line": p.line - 1, "character": p.column})
}
fn range(span: Span) -> Value { json!({"start":position(span,false),"end":position(span,true)}) }
struct Body { nodes: Vec<Value>, parent: String, serial: usize }
impl Body {
    fn node(&mut self, kind: &str, label: String, span: Span, target: Option<Span>) -> String {
        self.serial += 1;
        let id = format!("{}:{}", kind, self.serial);
        self.nodes.push(json!({"id":id,"parent":self.parent,"kind":kind,"name":label,"range":range(span),"target":target.map(|s|position(s,false))}));
        id
    }
}
impl<'ast> Visit<'ast> for Body {
    // Nested item declarations have their own inventory/ownership.
    fn visit_item(&mut self, _: &'ast syn::Item) {}
    fn visit_expr(&mut self, expr: &'ast Expr) {
        let old = self.parent.clone();
        match expr {
            Expr::Match(m) => {
                let id = self.node("match", format!("match {}", m.expr.to_token_stream()), m.span(), None);
                self.parent = id.clone();
                self.visit_expr(&m.expr);
                for arm in &m.arms {
                    self.parent = id.clone();
                    let label = format!("{}{}", arm.pat.to_token_stream(), arm.guard.as_ref().map(|(_,g)|format!(" if {}",g.to_token_stream())).unwrap_or_default());
                    self.parent = self.node("arm", label, arm.span(), None);
                    if let Some((_, guard)) = &arm.guard { self.visit_expr(guard); }
                    self.visit_expr(&arm.body);
                }
            }
            Expr::Call(c) => {
                let target = if let Expr::Path(p) = c.func.as_ref() { p.path.segments.last().map(|s|s.ident.span()) } else { None };
                self.parent = self.node("call", format!("{}(…)", c.func.to_token_stream()), c.span(), target);
                visit::visit_expr_call(self,c);
            }
            Expr::MethodCall(c) => {
                self.parent = self.node("call", format!("{}(…)", c.method), c.span(), Some(c.method.span()));
                visit::visit_expr_method_call(self,c);
            }
            Expr::If(i) => {
                self.parent = self.node("branch", format!("if {}", i.cond.to_token_stream()), i.span(), None);
                self.visit_expr(&i.cond);
                let branch = self.parent.clone();
                self.parent = self.node("arm", "then".into(), i.then_branch.span(), None);
                self.visit_block(&i.then_branch);
                if let Some((_, other)) = &i.else_branch {
                    self.parent = branch;
                    self.parent = self.node("arm", "else".into(), other.span(), None);
                    self.visit_expr(other);
                }
            }
            Expr::Closure(c) => {
                self.parent = self.node("closure", "closure (deferred body)".into(), c.span(), None);
                self.visit_expr(&c.body);
            }
            _ => visit::visit_expr(self, expr),
        }
        self.parent = old;
    }
}
struct Functions<'a> { names: &'a [String], result: Vec<Value> }
impl Functions<'_> {
    fn collect(&mut self, sig: &syn::Signature, block: &syn::Block) {
        if !self.names.is_empty() && !self.names.iter().any(|n| n == &sig.ident.to_string()) { return; }
        let mut body = Body { nodes: vec![], parent: "function".into(), serial: 0 };
        body.visit_block(block);
        self.result.push(json!({"name":sig.ident.to_string(),"position":position(sig.ident.span(),false),"nodes":body.nodes}));
    }
}
impl<'ast> Visit<'ast> for Functions<'_> {
    fn visit_item_fn(&mut self, f: &'ast syn::ItemFn) {
        self.collect(&f.sig, &f.block);
        visit::visit_item_fn(self, f);
    }
    fn visit_impl_item_fn(&mut self, f: &'ast syn::ImplItemFn) {
        self.collect(&f.sig, &f.block);
        visit::visit_impl_item_fn(self, f);
    }
    fn visit_trait_item_fn(&mut self, f: &'ast syn::TraitItemFn) {
        if let Some(block) = &f.default { self.collect(&f.sig, block); }
        visit::visit_trait_item_fn(self, f);
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let source = std::fs::read_to_string(&args[0])?;
    let file = syn::parse_file(&source)?;
    let mut functions = Functions { names: &args[1..], result: vec![] };
    functions.visit_file(&file);
    println!("{}", serde_json::to_string(&functions.result)?);
    Ok(())
}
