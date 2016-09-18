var t = require('tap');

t.test("assertion-provided line numbering", function (t) {

    var wanted =
        "0001. A tool such as crumpler has reduced two long text documents"+
            " to just their differences.\n"+
        "  ...collapsed 3499 lines...\n"+
        "3501. Here ends the first 3501 lines, common to both documents.\n"+
        "3502. This line is in both documents at different line numbers.\n"+
        "3503. This line is not the same in both documents, but the line"+
            " number is not highlighted as a difference.\n"+
        "3504. The remaining lines of the two documents show as identical,"+
            " despite having different line numbers.\n"+
        "  ...collapsed 4698 lines...\n"+
        "8203. Finally, we reach the last line of the document.\n";
        
    var found =
        "0001. A tool such as crumpler has reduced two long text documents"+
            " to just their differences.\n"+
        "  ...collapsed 3499 lines...\n"+
        "3501. Here ends the first 3501 lines, common to both documents.\n"+
        "3502. We found this unexpected line in just one document,"+
            " offsetting line numbering for the remainder of the document.\n"+
        "3503. This line is in both documents at different line numbers.\n"+
        "3504. This line is different between the documents, but the line"+
            " number is not highlighted as a difference.\n"+
        "3505. The remaining lines of the two documents show as identical,"+
            " despite having different line numbers.\n"+
        "  ...collapsed 4698 lines...\n"+
        "8204. Finally, we reach the last line of the document.\n";
    
    t.equal(found, wanted, "diffs ignore line numbers",
            { lineNumberDelim: '. ' });
    t.end();
});
