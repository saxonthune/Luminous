use hemp_reference_fixture::EXPORTED as RENAMED;

struct Reader;
impl hemp_reference_fixture::support::Read for Reader {
    type Value = usize;
    fn get(&self) -> Self::Value { if true { RENAMED } else { 0 } }
}

fn main() {
    let _ = run(0);
    let value = RENAMED + hemp_reference_fixture::support::read();
    assert_eq!(value, 22);
}

fn leaf() -> usize { 1 }

fn run(flag: u8) -> usize {
    match flag {
        0 => match flag {
            0 => leaf(),
            _ => 0,
        },
        _ => 0,
    }
}
