'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const filename = path.join(__dirname, 'lune-ops.js');
let source = fs.readFileSync(filename, 'utf8');

source = source.replace(
  "    const ownerFilter = user ? ['user_id',$2 = undefined] : null;\n    void ownerFilter;\n",
  ''
);
source = source.replace(
  'if (!paystack.verifyWebhook(req.body,signature))',
  'if (!paystack.verifyWebhook(req.rawBody || req.body,signature))'
);

const patched = new Module(filename, module);
patched.filename = filename;
patched.paths = module.paths;
patched._compile(source, filename);

module.exports = patched.exports;
