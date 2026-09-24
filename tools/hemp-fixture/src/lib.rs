//! Small semantic-reference regression fixture.
pub mod support;
pub use support::SHARED as EXPORTED;
pub const LIMIT: usize = 7;
pub static TOTAL: usize = 9;
use LIMIT as ALIAS;

pub fn direct() -> usize { LIMIT + TOTAL }
pub fn alias() -> usize { ALIAS }
pub fn shadow() -> usize {
    const ALIAS: usize = 3;
    ALIAS
}
pub fn indirect() -> usize { direct() }

pub struct Store { pub size: usize }
pub trait Read { fn read(&self) -> usize; }
impl Read for Store {
    fn read(&self) -> usize { self.size + LIMIT }
}
impl Store {
    pub const DEFAULT: usize = LIMIT;
    pub fn new() -> Self { Self { size: Self::DEFAULT } }
}
pub enum Mode { Fast, Slow }
pub type Count = usize;
pub mod nested {
    pub fn read() -> usize { super::LIMIT }
}
