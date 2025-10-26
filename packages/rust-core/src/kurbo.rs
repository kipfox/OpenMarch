use svgtypes::{PathParser, PathSegment};
use kurbo::{CubicBez, QuadBez};
fn main() {
    let mut segments = Vec::new();
    for segment in PathParser::from("M118.02,51.5800 Q77.49,33.26 200.8,458.98 Q400.23,382.58 110.96,268.34 Q413.44,130.86 471.48,12.82 C400.22,96.72 154.92,313.49 365.95,427.32 C440.03,43.36 302.93,335.85 252.98,88.9 Q44.67,467.29 432.74,273.82 Q150.12,454.44 286.18,441.16 C206.97,299.46 215.52,80.66 152.56,406.3 Z") {
        segments.push(segment.unwrap());
    }

}
