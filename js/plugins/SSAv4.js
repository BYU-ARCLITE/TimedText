(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	var StyleHeader = /^\[V4\+ Styles\]\s*/;
	var EventsHeader = /^\[Events\]\s*/;
	var FontsHeader = /^\[Fonts\]\s*/;
	var GraphicsHeader = /^\[Graphics\]\s*/;
	var DialogueLine = /^Dialogue:.*/;
	var TimerLine = /^Timer:.*/;
	var SyncLine = /^Sync Point:.*/;
	var WrapLine = /^WrapStyle:.*/;
	
	var time_pat = /\s*(\d):([0-5]\d):([0-5]\d)\.(\d\d)\s*/;

	var ASSCue = TimedText.makeCueType(function(){
		this.wrapStyle = 0;
	});
	
	//doesn't handle all the modes, because the VTT rendering rules subsume some of them
	//for now, eliminate all styling; later, implement our own rendering rules
	function processCueText(text, mode){
		//replace with actual ASS text processing algorithm
		var dom = document.createDocumentFragment(),
			el = document.createElement('span'),
			newText = text.replace(/\\n|\\N|\\h|(\{\\.*?\})|[<>]/g, function(match){
				switch(match){
				case '\\n': return mode === 1?' ':'<br/>';
				case '\N': return '<br data-hard=1/>';
				case '\h': return '&nbsp;';
				case '<': return '&lt;';
				case '>': return '&gt;';
				default: return '';
				}
			});
		el.innerHTML = newText;
		[].slice.call(el.childNodes).forEach(dom.appendChild.bind(dom));
		return dom;
	}
	
	ASSCue.prototype.getCueAsHTML = function() {
		if(!this.DOM){
			this.DOM = processCueText(this.text, this.wrapStyle);
		}
		return this.DOM.cloneNode(true);
	};
	
	function SSAtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,cs,text;
		hh = Math.min(Math.floor(minutes/60),9);
		mm = (minutes%60);
		ss = (seconds%60);
		cs = Math.floor(100*(time-seconds));
		return hh+":"+(mm>9?mm:"0"+mm)+":"+(ss>9?ss:"0"+ss)+"."+(cs>9?cs:"0"+cs);
	}
	
	//For now, just remove all formatting.
	//Later, figure out how to translate to Sub Station overrides.
	function escapeText(text){
		var el = document.createElement('div');
		el.innerHTML = text;
		return el.textContent.replace('\n','\\n');
	}
	
	function serializeCue(cue, stylename){
		return "Marked=0,"+SSATime(cue.startTime)+","+SSATime(cue.startTime)+","+stylename+","+escapeText(cue.text)+"\n";
	}
	
	function parseTimestamp(time){
		var match = time_pat.exec(time);
		if(!match){ throw new Error(); }
		return parseInt(match[1],10)*3600
			+parseInt(match[2],10)*60
			+parseInt(match[3],10)
			+parseInt(match[4],10)/100;
	}

	function parseEventLine(line, fnum){
		var i, fromIndex = 9, flist = [];
		for(;fnum > 1; fnum--){
			i = line.indexOf(",", fromIndex)+1;
			if(i === -1){ throw new Error(); }
			flist.push(line.substring(fromIndex,i-1));
			fromIndex = i;
		}
		flist.push(line.substr(fromIndex));
		return flist;
	}
	
	function parseEvents(globals, lines){
		var fieldList, n, cue,
			line = lines.pop(),
			formatMap = {};
			
		while(line && line.substr(0,7) !== "Format:"){ line = lines.pop(); }
		if(!lines.length){ return; }
		
		fieldList = line.substr(7).split(/\s*,\s*/g);
		fieldList.forEach(function(field, index){ formatMap[field] = index; });
		n = fieldList.length;
		
		while(line = lines.pop()){
			if(DialogueLine.test(line)){
				try{
					fieldList = parseEventLine(line, n)
					cue = new ASSCue(
						globals.tmul*parseTimestamp(fieldList[formatMap['Start']])+globals.sync, //startTime
						globals.tmul*parseTimestamp(fieldList[formatMap['End']])+globals.sync, //endTime
						fieldList[formatMap['Text']]);
					cue.wrapStyle = globals.wrapStyle;
					globals.cuelist.push(cue);
				}catch(e){}
			}else if(FontsHeader.test(line)){
				return null;
			}else if(GraphicsHeader.test(line)){
				return null;
			}
		}
		return null;
	}
	
	function parseStyles(globals,lines){
		var line;
		//For now, all styling is ignored
		//In the future, a subset could be translated into VTT-compatible settings & styles
		while(line = lines.pop()){
			if(EventsHeader.test(line)){
				return parseEvents;
			}
		}
		return null;
	}
	
	function parseInfo(globals,lines){
		var line;
		while(line = lines.pop()){
			if(SyncLine.test(line)){
				globals.sync = parseTimeCode(line.substr(11));
			}else if(TimerLine.test(line)){
				globals.tmul = (parseFloat(line.substr(6))||100)/100;
			}else if(WrapLine.test(line)){
				globals.wrapStyle = Math.max(parseInt(line.substr(10),10),0);
				if(globals.wrapStyle > 3){ globals.wrapStyle = 0; }
			}else if(StyleHeader.test(line)){
				return parseStyles;
			}
		}
		return null;
	}
	
	function parse(input){
		var line,lines,l,p,
			len = input.length,
			section = parseInfo,
			globals = {
				sync: 0,
				tmul: 1,
				wrapStyle: 0,
				styles: {},
				cuelist: []
			};

		//If the first character is a BYTE ORDER MARK, skip it.
		l = p = +(input[0] === '\uFEFF');
		//Collect a sequence of chars that are not CR or LF.
		while(p < len && input[p] !== '\r' && input[p] !== '\n'){p++;}
		line = input.substring(l,p);
		if(!/^\[Script Info\]\s*$/.test(line)){throw new Error("Not SSA Data");}
		
		//If position is past the end of input, end.
		if(p >= len){return [];}
		lines = input.substr(line.length).split(/(\r*\n+)+/g).filter(function(l){
			return !/^\s*(;.*)?$/.test(l);
		});
		lines.reverse();
		
		while(typeof section === 'function'){
			section = section(globals, lines);
		}
		return {
			cueList: globals.cuelist,
			kind: 'subtitles',
			lang: '',
			label: ''
		};
	}	
	
	TimedText.registerType('text/x-ssa',{
		extension: 'ass',
		name: 'Sub Station Alpha',
		cueType: ASSCue,
		parse: parse,
		isCueCompatible: function(cue){ return cue instanceof ASSCue; },
		formatHTML: null,
		textFromHTML: null,
		serialize:  function(data){
			if(!(data instanceof Array)){ data = data.cues; }
			//Don't know if all of the fields are reuired or not; if they are, it may take some finagling to come up with reasonable values
			return "[Script Info]\nScriptType: v4.00+\nCollisions: Normal\nPlayResY: 600\nPlayResX: 800\nTimer: 100.0000\nWrapStyle:0\n\n"
			+"[V4+ Styles]\nFormat: Name, Fontname\nStyle: DefaultStyle, Arial\n\n"
			+"[Events]\nFormat: Marked,Start,End,Style,Text\n"
			+data.map(function(cue){ return serializeCue(cue,"DefaultStyle"); }).join('');
		}
	});
}());