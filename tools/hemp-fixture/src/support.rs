//! Out-of-line module used through a library re-export.
pub const SHARED: usize = 11;

pub trait Read {
    type Value;
    fn get(&self) -> Self::Value;
}

pub fn read() -> usize {
    if true { SHARED } else { 0 }
}
