const {app, BrowserWindow} = require('electron');
const process = require('process');
const EventEmitter = require('events');
const iconv = require('iconv-lite')
class WindowProvider extends EventEmitter{
  static runAtLoad(url, script){
    let win;
    return new Promise((ac, re) => {
      win = new BrowserWindow({width: 640, height: 480, show: false});
      win.loadURL(url);
      
      win.webContents.on('did-finish-load', function(){
        setTimeout(_ => ac(win.webContents.executeJavaScript(script)), 2000);
      });
    }).then(r => (win.close(), r));
  }
  constructor(url){
    super();
    this.win = new BrowserWindow({width: 640, height: 480, show: false, webPreferences: {
      //sandbox: true,
      contextIsolation: true,
      nodeIntegration: true,
    }});
    this.url = url;
  }
  run(){
    
    this.win.webContents.on('did-finish-load', () => 
      this.emit('load') 
    );
    this.win.webContents.on('did-frame-finish-load', (e, m) => 
      this.emit('frameload', e, m) 
    );
    this.win.webContents.on('dom-ready', () => 
      this.emit('ready') 
    );
    this.win.webContents.on('did-start-loading', () => this.emit('doc'));
    this.win.on('ready-to-show', () => this.emit('show'));
    this.win.loadURL(this.url);
  }
  eval(script, obj){
    if(typeof(script) === 'function'){
      obj = obj || {};
      return this.win.webContents.executeJavaScript(`(${script.toString()})(JSON.parse(${JSON.stringify(JSON.stringify(obj))}))`, true);
    }else{
      return this.win.webContents.executeJavaScript(script, true);
    }
  }
  
  doc(){
    return this.win.webContents.executeJavaScript('document', true);
  }
  close(){
    if(this.win){
      this.win.close();
      this.win = null;
    }
  }
}

const C2MUSIC = {
  SEARCH: {
    INTERFACE: Symbol('interface'),
      ID:        Symbol("id"),
      TITLE:     Symbol("title"),
      DURATION:  Symbol("duration")
  },
  PLAY:{
    INTERFACE:     Symbol('play'),
      PLAYTIME:    Symbol('playtime'),
      TOTALTIME:   Symbol('totaltime'),
      PAUSE:       Symbol('pause'),
      PLAY:        Symbol("play"),
      SETVOLUME  : Symbol("set-volume"),
      GETVOLUME  : Symbol("get-volume"),
      ISPAUSE    : Symbol("pause?"),
      ISDONE     : Symbol("done?"),
      SEEK       : Symbol("seek"),
      LRC        : Symbol("lyric"),
      CURRENTLRC : Symbol("curlyric"),
      GETMODE    : Symbol("getmode"),
      SETMODE    : Symbol("setmode"),
      LOOPMODE: {
        SEQUENCE: 'sequence',
        SINGLE  : 'single',
        ALL     : 'all',
        RANDOM  : 'random',
      }
  }   
};

class NeteasePlayer{
  constructor(win){
    this.win = win;
  }
  async [C2MUSIC.PLAY.PLAYTIME](){
    if(this.win){
      return await this.win.eval(`
        document.querySelector(".g-btmbar .j-flag.time em").innerText
     `);
    }
  }

  async [C2MUSIC.PLAY.TOTALTIME](){
    if(this.win){
      return await this.win.eval(function(){
        return document.querySelector(".g-btmbar .j-flag.time").children[1].firstChild.nextSibling.nodeValue.replace("/", "").trim();
      });
    }
  }

  async [C2MUSIC.PLAY.ISPAUSE](){
    if(this.win){
      return await this.win.eval(function(){
        return document.querySelector(".ply.j-flag").classList.contains("pas");
      });
    }
  }

  async _togglePlayPause(){
    return await this.win.eval(function(){
        document.querySelector(".ply.j-flag").click();
    });
  }

  async [C2MUSIC.PLAY.PLAY](){
    if(await this[C2MUSIC.PLAY.ISPAUSE]()){
      await this._togglePlayPause();
    }
  }

  async [C2MUSIC.PLAY.PAUSE](){
    if(!await this[C2MUSIC.PLAY.ISPAUSE]()){
      await this._togglePlayPause();
    }
  }

  async _getBar(){
    if(this.win){
      return await this.win.eval(`
        (function(){
         let a = document.querySelector(".barbg").getBoundingClientRect();
         return JSON.stringify({left: a.left, bottom: a.bottom, right: a.right, top: a.top, width: a.width, height: a.height})
         })();
     `);
    }
  }

  async [C2MUSIC.PLAY.SEEK](now, all){
    if(this.win){
      let u = JSON.parse(await this._getBar());
      let uy = (u.top + u.bottom) / 2, ux = u.left + u.width * now / all;
      await this.win.eval(`
         (function(){
           let e = new MouseEvent("mousedown", {clientX: ${ux}, clientY: ${uy}});
           document.querySelector(".barbg").dispatchEvent(e);
           return true;
         })();
      `);
    }
  }

  async [C2MUSIC.PLAY.SETVOLUME](val){
    if(this.win){
      console.log(val);
      await this.win.eval(function({val}){
        let $ = document.querySelector.bind(document);
        let bar = $(".vbg").getBoundingClientRect();
        let ux  = (bar.left + bar.right) / 2;
        let uy  = (bar.bottom - 10 - val / 100 * (bar.height - 20));
        console.log(val, ux, uy);
        $(".vbg").dispatchEvent(new MouseEvent("mousedown", {clientX: ux, clientY: uy}));
        document.dispatchEvent(new MouseEvent("mouseup", {clientX: 0, clientY: 0}));
      }, {val});
    }
  }

  async [C2MUSIC.PLAY.GETVOLUME](){
    if(this.win){
      return await this.win.eval(function(){
        let $ = document.querySelector.bind(document);
        let h = +$(".vbg .curr").style.height.replace("px", "");
        return Math.round(h / 93 * 100);
      });
    }
  }

  async [C2MUSIC.PLAY.CURRENTLRC](){
    if(this.win){
      return await this.win.eval(function(){
        if(!document.querySelector("[data-action='clear']")){
          document.querySelector("[data-action='panel']").click();
          return "";
        }
        var a = document.querySelector(".j-flag.z-sel");
        if(a){
          return a.innerText;
        }else{
          return "";
        }
      });
    }
  }

  async [C2MUSIC.PLAY.GETMODE](){
    let classList = await this.win.eval(function(){
      let obj = document.querySelector('[data-action="mode"]');
      return obj.classList;
    });
    switch(classList['1']){
      case 'icn-loop':
        return C2MUSIC.PLAY.LOOPMODE.ALL;
      case 'icn-one':
        return C2MUSIC.PLAY.LOOPMODE.SINGLE;
      case 'icn-shuffle':
        return C2MUSIC.PLAY.LOOPMODE.RANDOM;
      default:
        return '';
    }
  }
  async [C2MUSIC.PLAY.SETMODE](mode){
    let modeclass;
    switch(mode){
      case C2MUSIC.PLAY.LOOPMODE.ALL:
        modeclass = 'icn-loop'; break;
      case C2MUSIC.PLAY.LOOPMODE.SINGLE:
        modeclass = 'icn-one'; break;
      case C2MUSIC.PLAY.LOOPMODE.RANDOM:
        modeclass = 'icn-shuffle'; break;
    }
    await this.win.eval(function({mode}){
      
      let f = function(){
        let obj = document.querySelector('[data-action="mode"]');
        console.log(mode, obj.classList);
        if(obj.classList.contains(mode)) return;
        obj.click();
        setTimeout(f, 500);
      };
      f();
    }, {mode: modeclass});
  }

  async [C2MUSIC.PLAY.LRC](){
    if(this.win){
      return await this.win.eval(function(){
        var a = document.querySelectorAll(".j-flag");
        return [].map.call(a, x => x.innerText);
      });
    }
  }
  
  available(){
    return !!this.win;
  }

  close(){
    if(this.win){
      this.win.close();
      this.win = null;
    }
  } 
}

class Netease{
  constructor($window = WindowProvider){
    this.$window = $window;
  }
  [C2MUSIC.SEARCH.INTERFACE](keyword){
    return new Promise((ac, re) =>{
      let conv = str => iconv.encode(Buffer.from(str, 'utf-8'), 'gbk').toString();
      this.$window.runAtLoad(`http://music.163.com/#/search/m/?s=${encodeURIComponent(keyword)}&type=1`,
        `
          [].map.call(
                 document.querySelector("#g_iframe").contentWindow
                .document.querySelectorAll('.n-srchrst .f-cb'),
                x => {
                  let key = x.querySelector("a[id^='song_']");
                  let ret = {};
                  ret.id       = key.dataset.resId;
                  ret.title    = x.querySelector(".text").innerText;
                  ret.author   = x.querySelector(".w1 .text").innerText;
                  ret.album   = x.querySelector(".w2 .text").innerText;
                  ret.duration = x.querySelector(".td:last-child").innerText;
                  ret.url      = 'http://music.163.com/#/song?id=' + ret.id;
                  return ret;
                }
          )
        `).then(x => ac(x)).catch(x => console.log(x))
    });
  }
  
  
  [C2MUSIC.PLAY.INTERFACE]({id}){
    return new Promise((ac, re) => {
      let $w = this.$window;
      let win = new $w(`http://music.163.com/#/song?id=${id}`);
      win.on('ready', _ => {
        // win.win.show();
        //win.win.hide();
        win.eval(`
      
        let c = setInterval(_ => {
          let b = document.querySelector("[data-action='panel']");
          if(b){
            clearInterval(c);
            b.click();
            let d = setInterval(_ => {
              let b = document.querySelector("[data-action='clear']");
              if(b){
                clearInterval(d);
                  let a = setInterval(_ => {
                    let doc = document.querySelector("#g_iframe").contentWindow.document;
                    let b = doc && doc.querySelector("a[data-res-action='play']");
                    if(b){
                        b.click();
                        clearInterval(a);  
                    }
                }, 100);
                b.click();
              }else{
                document.querySelector("[data-action='panel']").click();
              }
            }, 100);
          }
        }, 100);
       
        
        6
      `).then( _ => {
          ac(new NeteasePlayer(win));
      }).catch(console.log);
        
      });
      win.run();
      

    });
  }
}

let mainWin;
let {ipcMain: M} = require('electron');
const init = () => {
  mainWin = new BrowserWindow({show: true, width: 320, height: 160, frame: false, transparent: true, alwaysOnTop: true});
  mainWin.loadURL(`file:///${__dirname}/index.html`);
  mainWin.on('close', _ => app.quit());
};


let time = (a) => a.split(":").reduce((a, b) => +a * 60 + +b, 0);

app.on('ready', async _ => {
  init();
  let id = 0;
  let IDS = {};
  M.on('play163', async (e, a) => {
    let netease  = new Netease();
    let result   = await netease[C2MUSIC.SEARCH.INTERFACE](a.value);
    if(a.id){ IDS[a.id].close(); }
    let playable = await netease[C2MUSIC.PLAY.INTERFACE](result[0]);
    let song     = result[0];
    ++id;
    IDS[id]      = playable;
    e.sender.send('id', id);
    let u = setInterval(async _ => {
      if(playable.available()){
        e.sender.send('status', {
          now: time(await playable[C2MUSIC.PLAY.PLAYTIME]()),
          all: time(song.duration),
          url: song.url,
          title: song.title,
          id: song.id,
          author: song.author,
          album: song.album,
          curlrc: await playable[C2MUSIC.PLAY.CURRENTLRC](),
          volume: await playable[C2MUSIC.PLAY.GETVOLUME](),
          play:   !(await playable[C2MUSIC.PLAY.ISPAUSE]()),
        });
      }else{
        clearInterval(u);
      }
    }, 500);
  });
  M.on('seek', async(e, a) => {
    if(a.id){
      let control = IDS[a.id];
      control[C2MUSIC.PLAY.SEEK](a.now, a.all);
    }
  });
  M.on('setpause', async(e, a)=>{
    if(a.id){
      let control = IDS[a.id];
      await control[C2MUSIC.PLAY.PAUSE]();
    }
  });
  M.on('setplay', async(e, a)=>{
    if(a.id){
      let control = IDS[a.id];
      await control[C2MUSIC.PLAY.PLAY]();
    }
  });
  M.on('volume', async(e, a)=>{
    if(a.id){
      let control = IDS[a.id];
      console.log(a.value);
      await control[C2MUSIC.PLAY.SETVOLUME](a.value);
    }
  });
});

