var sys = require('sys'),
    http = require('http');
    querystring = require('querystring');

var fs = require("fs");
var uglify = require("uglify-js"), // symlink ~/.node_libraries/uglify-js.js to ../uglify-js.js
    jsp = uglify.parser,
    pro = uglify.uglify;

var options = {
        ast: false,
        mangle: true,
        mangle_toplevel: false,
        squeeze: true,
        make_seqs: true,
        dead_code: true,
        verbose: false,
        show_copyright: false,
        out_same_file: false,
        max_line_length: 32 * 1024,
        unsafe: false,
        reserved_names: null,
        defines: { },
        lift_vars: false,
        codegen_options: {
                ascii_only: true,
                beautify: false,
                indent_level: 4,
                indent_start: 0,
                quote_keys: false,
                space_colon: false,
                inline_script: false
        },
        make: false,
        output: true            // stdout
};

jsp.set_logger(function(msg){
    sys.debug(msg);
});
 
function show_copyright(comments) {
    var ret = "";
    for (var i = 0; i < comments.length; ++i) {
        var c = comments[i];
        if (c.type == "comment1") {
                ret += "//" + c.value + "\n";
        } else {
                ret += "/*" + c.value + "*/";
        }
    }
    return ret;
};
function squeeze_it(code) {
    var result = "";
    if (options.show_copyright) {
        var tok = jsp.tokenizer(code), c;
        c = tok();
        result += show_copyright(c.comments_before);
    }
    var ast = time_it("parse", function(){ return jsp.parse(code); });
    if (options.lift_vars) {
        ast = time_it("lift", function(){ return pro.ast_lift_variables(ast); });
    }
    if (options.mangle) ast = time_it("mangle", function(){
        return pro.ast_mangle(ast, {
                toplevel: options.mangle_toplevel,
                defines: options.defines,
                except: options.reserved_names
        });
    });
    if (options.squeeze) ast = time_it("squeeze", function(){
        ast = pro.ast_squeeze(ast, {
            make_seqs  : options.make_seqs,
            dead_code  : options.dead_code,
            keep_comps : !options.unsafe
        });
        if (options.unsafe)
                ast = pro.ast_squeeze_more(ast);
        return ast;
    });
    if (options.ast)
        return sys.inspect(ast, null, null);
    result += time_it("generate", function(){ return pro.gen_code(ast, options.codegen_options) });
    if (!options.codegen_options.beautify && options.max_line_length) {
        result = time_it("split", function(){ return pro.split_lines(result, options.max_line_length) });
    }
    return result;
};

function time_it(name, cont) {
    if (!options.verbose)
            return cont();
    var t1 = new Date().getTime();
    try { return cont(); }
    finally { sys.debug("// " + name + ": " + ((new Date().getTime() - t1) / 1000).toFixed(3) + " sec."); }
};

function post_handler(request, callback){
    var _REQUEST = { };
    var _CONTENT = '';
    try{
        request.addListener('data', function(chunk){
            _CONTENT+= chunk;
        });

        request.addListener('end', function(){
            _REQUEST = querystring.parse(_CONTENT.toString('utf-8'));
            callback(_REQUEST);
        });
    } catch(ex) {
        throw ex;
    }
};

http.createServer(function (req, res) {
    res.writeHead(200, {
        'Content-type' : 'text/html'
        ,'Content-Encoding' : 'UTF-8'
    });
    var top = '<!doctype html><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><html><head><title>UglifyJS online</title></head><body>';
    var bottom = '</body></html>';
    if (req.method == 'POST') {
        post_handler(req ,function(POST){
            var compress = POST.content;
            var author = POST.author;
            if(compress){
                try{
                    compress = squeeze_it(compress);
                } catch(ex) {
                    sys.debug('server: ');
                    sys.debug(ex.stack);
                    sys.debug(sys.inspect(ex));
                    sys.debug(JSON.stringify(ex));
                    res.end([top,'<form action="/" method="POST"><input name="author" type="text" />'
                        ,'&nbsp;&nbsp;<input type="submit" /><br/>'
                        ,'<textarea cols="100" rows="20" name="content">'
                        ,ex.stack,JSON.stringify(ex)
                        ,'</textarea></form>',bottom].join(''));
                }
                compress = compress.replace(/</g,'&lt;');
                compress = compress.replace(/>/g,'&gt;');
                //compress = compress.replace(/\\u005C/,'\\');
                /*compress = compress.replace(/"/g,'&quot;');
                compress = compress.replace(/'/g,'\'');*/
            }
            res.end([top,'<form action="/" method="POST"><input name="author" type="text" />'
                ,'&nbsp;&nbsp;<input type="submit" /><br/>'
                ,'<textarea cols="100" rows="20" name="content">'
                ,'/* ',author||'nobody'
                ,' : ',new Date().toString(),' */\r\n'
                ,compress
                ,'</textarea></form>',bottom].join(''));
        });
    }
    else{
        res.end([top,'<form action="/" method="POST"><input name="author" type="text" />'
            ,'&nbsp;&nbsp;<input type="submit" /><br/>'
            ,'<textarea cols="100" rows="20" name="content"></textarea></form>',bottom].join(''));
    }
}).listen(8080);

sys.debug('Server running at http://127.0.0.1:8080/');
