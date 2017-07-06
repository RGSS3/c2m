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
  eval(script){
    return this.win.webContents.executeJavaScript(script, true);
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
      PAUSE:       Symbol('pause'),
      PLAY:        Symbol("play"),
      SETVOLUME  : Symbol("set-volume"),
      GETVOLUME  : Symbol("get-volume"),
      ISDONE     : Symbol("done"),
      SEEK       : Symbol("seek"),
      LRC        : Symbol("lyric"),
      CURRENTLRC : Symbol("curlyric"),
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

  async [C2MUSIC.PLAY.CURRENTLRC](){
    if(this.win){
      return await this.win.eval(`(function(){
        var a = document.querySelector(".j-flag.z-sel");
        if(a){
          return a.innerText;
        }else{
          return "";
        }
      })()`);
    }
  }

  async [C2MUSIC.PLAY.LRC](){
    if(this.win){
      return await this.win.eval(`(function(){
        var a = document.querySelectorAll(".j-flag");
        return [].map.call(a, x => x.innerText);
      })()`);
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
        //win.win.show();
        //win.win.hide();
        win.eval(`
        let a = setInterval(_ => {
           let doc = document.querySelector("#g_iframe").contentWindow.document;
           let b = doc && doc.querySelector("a[data-res-action='play']");
           if(b){
             b.click();
             clearInterval(a);  
           }
        }, 100);
        let c = setInterval(_ => {
          let b = document.querySelector("[data-action='panel']");
          if(b){
            clearInterval(c);
            b.click();
            let d = setInterval(_ => {
              let b = document.querySelector("[data-action='clear']");
              if(b){
                clearInterval(d);
                b.click();
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
    console.log(a);
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
});

