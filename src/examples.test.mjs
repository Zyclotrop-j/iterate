import assert from 'node:assert';

import ProcessConcurrently from "./index.mjs";

// MOCKS
let i = 0;
const fetch = async (url) => {
    const item = {
        json: () => Promise.resolve({
            i: i++,
            some: 'data',
            url,
        }),
        text: () => Promise.resolve(`data - ${i++} - ${url}`),
    }
    return Promise.resolve(item);
};
const reset = () => { i = 0; };
const fs = {
    readFile: (name) => Promise.resolve(Buffer.from(`DATA ${name} DATE`)),
    readdirSync: (name) => [`${name}/a`, `${name}/b`, `${name}/c`],
    readdir: (name) => Promise.resolve([`${name}/a`, `${name}/b`, `${name}/c`]),
    statSync: (name) => ({
        isDirectory: () => name.endsWith('c') && name.split('/').length < 6
    }),
};
const dommock = { innerHTML: '' };
const document = {
    querySelector: () => (dommock)
};
// MOCKS END

export default testfn => {

    const test = (name, fn) => {
        reset();
        return testfn(name, fn);
    }

    test('Call an api in the browser.', async function() {
        const fn = (item, { url }) => {
            return fetch(`${url}${item}`)
                .then(response => response.json());
        };
        const result = await ProcessConcurrently(fn, [1, 2, 3], {
            commonArgs: {
                url: 'https://jsonplaceholder.typicode.com/todos/'
            }
        });
        assert.deepEqual(result, [
              {
                i: 0,
                some: 'data',
                url: 'https://jsonplaceholder.typicode.com/todos/1'
              },
              {
                i: 1,
                some: 'data',
                url: 'https://jsonplaceholder.typicode.com/todos/2'
              },
              {
                i: 2,
                some: 'data',
                url: 'https://jsonplaceholder.typicode.com/todos/3'
              },
        ]);
    });
    test('File-system in nodejs.', async function() {
        const fn = (item, { folder }) => {
            return fs.readFile(`${folder}${item}`);
        };
        const [file1, file2] = await ProcessConcurrently(fn, ['foo', 'bar'], {
        commonArgs: {
            folder: './'
        }
        });
        assert.deepEqual(`${file1}`, 'DATA ./foo DATE');
        assert.deepEqual(`${file2}`, 'DATA ./bar DATE');
    });
    test('Use an iterator.', async function() {

        const upload = async (file, filename, target) => {
            return filename;
        }
        const fn = async (filename, { target, source }) => {
            const file = await fs.readFile(`${source}${filename}`);
            const isOK = await upload(file, filename, target);
            return isOK;
        };

        const iterateDir = function*(dir) {
        for(const fileOrDir of fs.readdirSync(dir)) {
            if (fs.statSync(fileOrDir).isDirectory()) {
                return yield* iterateDir(fileOrDir);
            } else {
            yield fileOrDir;
            }    
        }
        };

        const result = await ProcessConcurrently(fn, iterateDir('./source'), {
            commonArgs: {
                target: 'https://myapi/upload',
                source: './source',
            }
        });
        assert.deepEqual(result, [
            './source/a',
            './source/b',
            './source/c/a',
            './source/c/b',
            './source/c/c/a',
            './source/c/c/b',
            './source/c/c/c/a',
            './source/c/c/c/b',
            './source/c/c/c/c'
        ]);
    });
    test('Use an async iterator.', async function() {

        const upload = async (file, filename, target) => {
            return filename;
        }
        const fn = async (filename, { target, source }) => {
            const file = await fs.readFile(`${source}${filename}`);
            const isOK = await upload(file, filename, target);
            return isOK;
        };

        const iterateDir = async function*(dir) {
            for(const fileOrDir of await fs.readdir(dir)) {
                if (fs.statSync(fileOrDir).isDirectory()) {
                    return yield* iterateDir(fileOrDir);
                } else {
                    yield fileOrDir;
                }    
            }
        };

        const result = await ProcessConcurrently(fn, iterateDir('./source'), {
            commonArgs: {
                target: 'https://myapi/upload',
                source: './source'
            }
        });
        assert.deepEqual(result, [
            './source/a',
            './source/b',
            './source/c/a',
            './source/c/b',
            './source/c/c/a',
            './source/c/c/b',
            './source/c/c/c/a',
            './source/c/c/c/b',
            './source/c/c/c/c'
        ]);
    });
    test('Using meta-information.', async function() {
        let updated = 0;
        const fn = (item, { progressIndicator }, meta) => {
            progressIndicator.innerHTML = `Progress: ${(meta.done / meta.total * 100)}%`;
            updated++;
        };
        const result = await ProcessConcurrently(fn, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {
            commonArgs: { progressIndicator: document.querySelector('#progressindicator') }
        });
        assert.deepEqual(updated, 10);
        assert.deepEqual(document.querySelector('#progressindicator').innerHTML, 'Progress: 60%'); // batched by 4, so when it reaches 10, the last 4 are still in progess = 10-4 = 6 = 60%
    });
    test('Using meta-information.', async function() {
        let updated = 0;
        const fn = (item, { progressIndicator }, meta) => {
            progressIndicator.innerHTML = `Progress: ${(meta.done / meta.total * 100)}%`;
            updated++;
        };
        const result = await ProcessConcurrently(fn, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {
            commonArgs: { progressIndicator: document.querySelector('#progressindicator') },
            concurrency: 1,
        });
        assert.deepEqual(updated, 10);
        assert.deepEqual(document.querySelector('#progressindicator').innerHTML, 'Progress: 90%'); // batched by 1, so when it reaches 10, the last 1 is still in progess = 10-1 = 9 = 90%
    });

    return testfn;
};

