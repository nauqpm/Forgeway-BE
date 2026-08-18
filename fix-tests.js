const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.spec.ts')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Fix afterEach -> afterAll for app.close()
    content = content.replace(/afterEach\(async \(\) => \{\s+if \(app\) \{\s+await app\.close\(\);\s+\}\s+\}\);/g, 
        'afterAll(async () => {\n    if (app) {\n      await app.close();\n    }\n  });');

    // Find beforeEach that has createTestingModule
    const beforeEachRegex = /beforeEach\(async \(\) => \{([\s\S]*?)(const\s+\w+(?:\s*:\s*TestingModule)?\s*=\s*await\s+Test\.createTestingModule\(\{[\s\S]*?\}\)\.compile\(\);[\s\S]*?await\s+app\.init\(\);)\s+\}\);/;
    
    const match = content.match(beforeEachRegex);
    if (match) {
        const preModule = match[1]; // things before createTestingModule (like jest.clearAllMocks())
        const moduleInit = match[2]; // the createTestingModule and app.init() part

        const finalReplacement = `beforeAll(async () => {
    ${moduleInit}
  });

  beforeEach(() => {${preModule}});`;

        content = content.replace(beforeEachRegex, finalReplacement);
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    }
}

walkDir('./src', processFile);
console.log('Done.');
