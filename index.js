'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var Promise = _interopDefault(require('bluebird'));
var path = _interopDefault(require('path'));
var mime = _interopDefault(require('mime-types'));
var globby = _interopDefault(require('globby'));

const p = Promise.promisify;
const readdir = p(fs.readdir);
const readFile = p(fs.readFile);
const writeFile = p(fs.writeFile);
const stat = p(fs.stat);
const cwd = process.cwd();

class Page {
    constuctor(filepath, {
        load = function(){return this.source},
        output = function(){return this.content}
    } = {}){
        this.mimetype = mime.lookup(filepath);
        this.filepath = filepath;
        this.filename = path.basename(filepath);
        this.dirname = path.dirname(filepath);

        this._load = load;
        this._output = output;
    }
    load(after = (page)=>{}){
        return stat(this.filename)
        .then(stats=>{
            this.stats = stats;
            return readFile(filepath)
            .then(source=>(this.source = source))
        }).then(source=>{
            this.content = this._load(source);
            return after.call(this, this.content);
        });
    }
    toDirectory(dir, {autoTransfer}){
        return this.output(path.join(dir, this.filename), {autoTransfer});
    }
    streamTo(filename, {toPromise = true} = {}){
        let rs = fs.createReadStream(this.filename);
        let ws = fs.createWriteStream(filename);
        let pipe = rs.pipe(ws);
        if(!toPromise) return pipe;
        return new Promise((resolve, reject)=>{
            rs.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', resolve);
        });
    }
    output(filename, {
        autoTransfer = true
    } = {}){
        if(autoTransfer && this.mimetype.test(/^image|^video/)){
            return this.streamTo(filename);
        }
        return this.load()
        .then(v=>this._output(filename))
        .then(content=>{
            this.content = content;
            return writeFile(
                filename,
                content
            );
        });
    }
}


class Pages {
    constructor(directory, {
        globs = null,
        cwd = process.cwd(),
        load = (page)=>{},
        output = (dest)=>{}
    } = {}){
        this.directory = directory;
        this.cwd = cwd;
        this.pages = [];

        this._globs = globs;
        this._load = load;
        this._output = output;
    }
    load({
        globbing = null,
        globbyOptions = {},
        load = (page)=>{},
        output = (dest)=>{}
    } = {}){
        let loading = globbing
        ? globby(globbing, globbyOptions)
        : readdir(this.directory);

        return loading.then(files=>{
            return (this.pages = files
            .map((file, i)=>{
                let filepath = path.join(
                    this.cwd,
                    this.directory,
                    file
                );
                return new Page({
                    filepath,
                    load,
                    output
                });
            }));
        }).then(pages=>{
            return this._load(pages);
        });
    }
    output(dir, {
        load,
        output,
        autoTransfer = true
    } = {}){
        return this.load({load, output}).then(pages=>{
            let writing = (pages || this.pages)
            .map(page=>{
                return page.toDirectory(dir, {autoTransfer});
            });

            return Promise.all(writing);
        });
    }
}

exports.Page = Page;
exports.Pages = Pages;
