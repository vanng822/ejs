
/*!
 * EJS
 * Copyright(c) 2012 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var utils = require('./utils')
  , fs = require('fs');

/**
 * Library version.
 */

exports.version = '0.7.1';

/**
 * Filters.
 * 
 * @type Object
 */

var filters = exports.filters = require('./filters');

/**
 * funcs scope for using in template
 * call in template tag with funcs.yourFunction()
 * 
 * @type Object
 */
var funcs = exports.funcs = {};

/**
 * Intermediate js cache.
 * 
 * @type Object
 */

var cache = {};

/**
 * Clear intermediate js cache.
 *
 * @api public
 */

exports.clearCache = function(){
  cache = {};
};

/**
 * Translate filtered code into function calls.
 *
 * @param {String} js
 * @return {String}
 * @api private
 */

function filtered(js) {
  return js.substr(1).split('|').reduce(function(js, filter){
    var parts = filter.split(':')
      , name = parts.shift()
      , args = parts.shift() || '';
    if (args) args = ', ' + args;
    return 'filters.' + name + '(' + js + args + ')';
  });
};

/**
 * Re-throw the given `err` in context to the
 * `str` of ejs, `filename`, and `lineno`.
 *
 * @param {Error} err
 * @param {String} str
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

function rethrow(err, str, filename, lineno){
  var lines = str.split('\n')
    , start = Math.max(lineno - 3, 0)
    , end = Math.min(lines.length, lineno + 3);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? ' >> ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'ejs') + ':' 
    + lineno + '\n' 
    + context + '\n\n' 
    + err.message;
  
  throw err;
}

/**
 * Parse the given `str` of ejs, returning the function body.
 *
 * @param {String} str
 * @options {Object} options
 *  options.open
 *  options.close
 *  options.eatspace true for skipping whitespace, default is true
 * @return {String}
 * @api public
 */

var parse = exports.parse = function(str, options){
  var options = options || {}
    , open = options.open || exports.open || '<%'
    , close = options.close || exports.close || '%>',
    eatspace = true, whitespaceLast = false, closeMarkupLast = false;
    if (options.hasOwnProperty('eatspace')) {
       eatspace = options.eatspace;
    };

  var buf = [
      "var buf = [];"
    , "\nwith (locals) {"
    , "\n  buf.push('"
  ];
  
  var lineno = 1;

  var consumeEOL = false;
  for (var i = 0, len = str.length; i < len; ++i) {
    if (str.slice(i, open.length + i) == open) {
      i += open.length
  
      var prefix, postfix, line = '__stack.lineno=' + lineno;
      switch (str.substr(i, 1)) {
        case '=':
          prefix = "', escape((" + line + ', ';
          postfix = ")), '";
          ++i;
          break;
        case '-':
          prefix = "', (" + line + ', ';
          postfix = "), '";
          ++i;
          break;
        default:
          prefix = "');" + line + ';';
          postfix = "; buf.push('";
      }

      var end = str.indexOf(close, i)
        , js = str.substring(i, end)
        , start = i
        , n = 0;
        
      if ('-' == js[js.length-1]){
        js = js.substring(0, js.length - 2);
        consumeEOL = true;
      }
        
      while (~(n = js.indexOf("\n", n))) n++, lineno++;
      if (js.substr(0, 1) == ':') js = filtered(js);
      buf.push(prefix, js, postfix);
      i += end - start + close.length - 1;

    } else if (str.substr(i, 1) == "\\") {
      buf.push("\\\\");
      closeMarkupLast = false;
    } else if (str.substr(i, 1) == "'") {
      buf.push("\\'");
      closeMarkupLast = false;
    } else if (str.substr(i, 1) == "\r") {
      if (eatspace) {
         buf.push("");
      } else {
      	buf.push(" ");
      	whitespaceLast = true;
      }
    } else if (str.substr(i, 1) == "\t") {
    	if (!eatspace) {
    		buf.push("\\t");
    		whitespaceLast = true;
    	}
    	
    } else if (str.substr(i, 1) == "\n") {
      if (consumeEOL) {
        consumeEOL = false;
      } else {
        if (eatspace) {
          if (closeMarkupLast) {
            buf.push("");
          } else {
          	buf.push(" ");
          	whitespaceLast = true;
          	closeMarkupLast = false;
          }
      	} else {
      	  buf.push("\\n");
      	}
        lineno++;
      }
    } else {
      if (str.substr(i, 1) == ' ') {
      	if (whitespaceLast) {
      	  continue;
      	} else {
      	  whitespaceLast = true;
      	}
      } else {
      	whitespaceLast = false;
      }
      if (str.substr(i, 1) == '>') {
      	closeMarkupLast = true;
      } else {
      	closeMarkupLast = false;
      }
      buf.push(str.substr(i, 1));
    }
  }

  buf.push("');\n}\nreturn buf.join('');");
  return buf.join('');
};

/**
 * Compile the given `str` of ejs into a `Function`.
 *
 * @param {String} str
 * @param {Object} options
 * @return {Function}
 * @api public
 */

var compile = exports.compile = function(str, options){
  options = options || {};
  
  var input = JSON.stringify(str)
    , filename = options.filename
        ? JSON.stringify(options.filename)
        : 'undefined';
  
  // Adds the fancy stack trace meta info
  str = [
    'var __stack = { lineno: 1, input: ' + input + ', filename: ' + filename + ' };',
    rethrow.toString(),
    'try {',
    exports.parse(str, options),
    '} catch (err) {',
    '  rethrow(err, __stack.input, __stack.filename, __stack.lineno);',
    '}'
  ].join("\n");
  
  if (options.debug) console.log(str);
  var fn = new Function('locals, filters, funcs, escape', str);
  return function(locals){
    return fn.call(this, locals, filters, funcs, utils.escape);
  }
};

/**
 * Render the given `str` of ejs.
 *
 * Options:
 *
 *   - `locals`          Local variables object
 *   - `cache`           Compiled functions are cached, requires `filename`
 *   - `filename`        Used by `cache` to key caches
 *   - `scope`           Function execution context
 *   - `debug`           Output generated function body
 *   - `open`            Open tag, defaulting to "<%"
 *   - `close`           Closing tag, defaulting to "%>"
 *
 * @param {String} str
 * @param {Object} options
 * @return {String}
 * @api public
 */

exports.render = function(str, options){
  var fn
    , options = options || {};

  if (options.cache) {
    if (options.filename) {
      fn = cache[options.filename] || (cache[options.filename] = compile(str, options));
    } else {
      throw new Error('"cache" option requires "filename".');
    }
  } else {
    fn = compile(str, options);
  }

  options.__proto__ = options.locals;
  return fn.call(options.scope, options);
};

/**
 * Render an EJS file at the given `path` and callback `fn(err, str)`.
 *
 * @param {String} path
 * @param {Object|Function} options or callback
 * @param {Function} fn
 * @api public
 */

var renderFile = exports.renderFile = function(path, options, fn){
  var key = path + ':string';

  if ('function' == typeof options) {
    fn = options, options = {};
  }

  options.filename = path;

  try {
    var str = options.cache
      ? cache[key] || (cache[key] = fs.readFileSync(path, 'utf8'))
      : fs.readFileSync(path, 'utf8');

    fn(null, exports.render(str, options));
  } catch (err) {
    fn(err);
  }
};

// express support
exports.__express = function(path, options, callback) {
	var layout;
	if (options.layout) {
		renderFile(path, options, function(err, content) {
			if (err) {
				return callback(err);
			}
			layout = options.settings.views + '/' + options.layout;
			options.body = content;
			renderFile(layout, options, callback);
		});
	} else {
		renderFile(path, options, callback);
	}
};

/**
 * Expose to require().
 */

if (require.extensions) {
  require.extensions['.ejs'] = function(module, filename) {
    source = require('fs').readFileSync(filename, 'utf-8');
    module._compile(compile(source, {}), filename);
  };
} else if (require.registerExtension) {
  require.registerExtension('.ejs', function(src) {
    return compile(src, {});
  });
}
