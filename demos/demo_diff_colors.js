var t = require('tap');

t.test("simple color diffs", function (t) {
    t.equal("abcdef", "abcdeF");
    t.equal("Abcdef", "abcdeF");
    t.equal("Abcdef", "abcdef");
    t.equal("abef", "abcdef");
    t.equal("abcdef", "abef");
    
    t.equal({ x: 'abc', y: 'def' }, { x: '123', y: '456' });
    
    var longText1 = "This is a long line that shows what happens when a single-line comparison gets wrapped onto a second line.";
    var longText2 = "Here we have a really really long line that should have nothing in common with it's compared line, at least not at the beginnings and endings of the line. We want at least three lines here.";
    
    t.equal(longText1, '');
    t.equal(longText1, longText2);
    
    var multiLine1 = "1:Now we try line numbers.\n"+
        "2:We have three lines. Need to be sure that at least one of the lines spans multiple lines when wrapped.\n"+
        "3:Same last line.";
    var multiLine2 = "1:Zilch in common with other first line.\n2:Same last line.";
    
    t.equal(multiLine1, multiLine2, "with line numbering extra",
            { lineNumberDelim: ':' });
    
    t.end();
});