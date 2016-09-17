var tap = require('tap');

class ClassA {
    constructor (x, y) { this.x = x; this.y = y; }
}

class ClassB {
    constructor (x, y) { this.x = x; this.y = y; }
}       

tap.test("unequal but should be equal", function (t) {
    t.equal("with a sudtle difference", "with a subtle difference");
    t.equal("line 1\nline 2", "line 1\nline 2\n", "missing LF");
    t.equal(1234, "1234", "an integer and a string");
    t.equal({ x: 1, y: 2 }, { x: 1, y: 3 });
    t.strictSame(new ClassA(1, 2), new ClassB(1, 2), "different classes");
    t.end();
});

tap.test("equal but should be unequal", function (t) {
    t.notEqual(-1, -1, "don't want -1");
    t.notEqual("line 1 \nline 2  ", "line 1 \nline 2  ",
            "with trailing spaces");
    t.notEqual("123", "123", "clearly a string");
    t.end();
});