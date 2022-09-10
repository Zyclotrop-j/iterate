import baretest from 'baretest';
import ProcessConcurrentlyTest from './src/ProcessConcurrently.test.mjs';
import HelperTest from './src/helpers.test.mjs';
import ExampleTest from './src/examples.test.mjs';

!(async function() {
    await ProcessConcurrentlyTest(baretest('ProcessConcurrently')).run();
    await HelperTest(baretest('Helper')).run();
    await ExampleTest(baretest('Examples')).run();
})();
