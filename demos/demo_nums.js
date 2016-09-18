var t = require('tap');

t.test("assertion-provided line numbering", function (t) {

    var wanted =
        "1:The line numbers in this wanted text don't get differenced.\n"+
        "2:A unique second line groups with the prior line.\n"+
        "3:Both found and wanted text share this third line.\n"+
        "4:This long line is missing from the found text. It wraps across lines and has no similar counterpart line.\n"+
        "5:The line is also shared, but at different line numbers. The line number shown with -d is its line number in found text.\n"+
        "6:The last line is like its counterpart, but at a different line number. The different line number is not highlighted as a difference.";
        
    var found =
        "1:The line numbers in this found text also don't get differenced.\n"+
        "2:Another unique second line grouping with the prior line.\n"+
        "3:Both found and wanted text share this third line.\n"+
        "4:The line is also shared, but at different line numbers. The line number shown with -d is its line number in found text.\n"+
        "5:The last line is similar to its counterpart, but at a different line number. The different line number is not highlighted as a difference.";
    
    t.equal(found, wanted, "diffs ignore line numbers",
            { lineNumberDelim: ':' });
    
    t.end();
});