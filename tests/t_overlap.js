var t = require('tap');

t.test("only in a subtest", function (t) {
    var found =
        "[23 chars...]wxyz*BCD[...23 chars]\n"+
        "/abcdefghijklmnopqrst[...33 chars]\n"+
        "-abcdefghijklmnopqrst[...3 chars]\n";
    var wanted =
        "[23 chars...]wxyz*BCD[...23 chars]\n"+
        "/abcdefghijklmnopqrst[...33 chars]\n"+
        "-abcdefghijklmnopqrst[...33 chars]\n";

    t.equal(found, wanted);

    t.equal("abc3def", "abc33def", "3 vs 33");
    t.equal("abc3def", "abc333def", "3 vs 333");
    t.equal("abc33def", "abc33333def", "33 vs 33333");

    t.equal("abc33def", "abc3def", "33 vs 3");
    t.equal("abc333def", "abc3def", "333 vs 3");
    t.equal("abc33333def", "abc33def", "33333 vs 33");
    
    t.end();
});