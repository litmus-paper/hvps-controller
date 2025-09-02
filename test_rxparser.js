// Load and test RxParser
const fs = require('fs');
const path = require('path');

// Read and evaluate the RxParser code
const rxParserCode = fs.readFileSync(path.join(__dirname, 'js', 'rxParser.js'), 'utf8');
eval(rxParserCode);

// Run the self-test
const results = RxParser.runSelfTest();

console.log('RxParser Self-Test Results:');
console.log('Token    | Expected     | Actual       | Result');
console.log('---------|--------------|--------------|--------');

results.forEach(result => {
    const token = result.token.padEnd(8);
    const expected = result.expected.padEnd(12);
    const actual = result.actual.padEnd(12);
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${token} | ${expected} | ${actual} | ${status}`);
});

// Summary
const passCount = results.filter(r => r.passed).length;
const totalCount = results.length;
console.log(`\nSummary: ${passCount}/${totalCount} tests passed`);

// Clean up
fs.unlinkSync(__filename);