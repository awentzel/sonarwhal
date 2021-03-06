import * as sinon from 'sinon';
import test from 'ava';
import { EventEmitter2 } from 'eventemitter2';

import BabelConfigParser from '../src/parser';

test.beforeEach((t) => {
    t.context.sonarwhal = new EventEmitter2({
        delimiter: '::',
        maxListeners: 0,
        wildcard: true
    });
});

test('If no file is parsed, it should emit a `parse::babel-config::error::not-found` error', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('scan::end', {});

    t.true(t.context.sonarwhal.emitAsync.calledTwice);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::not-found');

    sandbox.restore();
});

test(`If a 'package.json' file is parsed, but it doesn't have the 'babel' property, it should emit a 'parse::babel-config::error::not-found' error`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: 'package.json',
        response: { body: { content: '{"prop":{"setting":true}}' } }
    });

    await t.context.sonarwhal.emitAsync('scan::end', {});

    t.is(t.context.sonarwhal.emitAsync.callCount, 3);
    t.is(t.context.sonarwhal.emitAsync.args[2][0], 'parse::babel-config::error::not-found');

    sandbox.restore();
});

test(`If the resource doesn't match the target file names, nothing should happen`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', { resource: '.babelrcconfig' });

    t.true(t.context.sonarwhal.emitAsync.calledOnce);

    sandbox.restore();
});

test('If the file contains an invalid json, it should fail', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: '{"invalidJson}' } }
    });

    t.true(t.context.sonarwhal.emitAsync.calledTwice);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::json');

    sandbox.restore();
});

test(`If .babelrc contains an invalid schema, it should emit the 'parse::babel-config::error::schema' event`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    const invalidSchemaContent = `{
        "plugins": ["transform-react-jsx"],
        "moduleId": 1,
        "ignore": [
          "foo.js",
          "bar/**/*.js"
        ]
      }`;

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});

test(`If 'package.json' contains an invalid 'babel' property, it should emit the 'parse::babel-config::error::schema' event`, async (t) => {
    const sandbox = sinon.sandbox.create();
    const invalidSchemaContent = `{
        "babel": {
          "plugins": ["transform-react-jsx"],
          "moduleId": 1,
          "ignore": [
            "foo.js",
            "bar/**/*.js"
          ]
        },
        "version": "1.0.0"
      }`;

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: 'package.json',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});

test('If the content type is unknown, it should still validate if the file name is a match', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    const invalidSchemaContent = `{
        "plugins": ["transform-react-jsx"],
        "moduleId": 1,
        "ignore": [
          "foo.js",
          "bar/**/*.js"
        ]
      }`;

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});
