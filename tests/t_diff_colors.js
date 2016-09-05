var t = require('tap');

t.test("simple color diffs", function (t) {
    t.equal("abcdef", "abcdeF");
    t.equal("Abcdef", "abcdeF");
    t.equal("Abcdef", "abcdef");
    t.equal("abef", "abcdef");
    t.equal("abcdef", "abef");
    
    t.equal({ x: 'abc', y: 'def' }, { x: '123', y: '456' });
    
    t.end();
});