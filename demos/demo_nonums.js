var t = require('tap');

t.test("automatic line numbering", function (t) {

    var wanted =
        "The line numbers in this wanted text don't get differenced.\n"+
        "A unique second line groups with the prior line.\n"+
        "Both found and wanted text share this third line.\n"+
        "This long line is missing from the found text. It wraps across"+
            " lines and has no similar counterpart line.\n"+
        "The line is also shared, but at different line numbers. The line"+
            " number shown with -d is its line number in found text.\n"+
        "The last line is like its counterpart, but at a different line"+
            " number. The different line number is not highlighted as a"+
            " difference."; 
    var found =
        "The line numbers in this found text also don't get differenced.\n"+
        "Another unique second line grouping with the prior line.\n"+
        "Both found and wanted text share this third line.\n"+
        "The line is also shared, but at different line numbers. The line"+
            " number shown with -d is its line number in found text.\n"+
        "The last line is similar to its counterpart, but at a different"+
            " line number. The different line number is not highlighted as"+
            " a difference.";
    
    t.equal(found, wanted, "diffs ignore line numbers");
    t.end();
});