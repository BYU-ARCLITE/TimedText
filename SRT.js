(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	function SRTCue(start,end,text){
		TextTrackCue.call(this,start,end,text);
		this.x1 = null;
		this.x2 = null;
		this.y1 = null;
		this.y2 = null;
	}
	
	/*
	Bold - <b> ... </b> or {b} ... {/b}
	Italic - <i> ... </i> or {i} ... {/i}
	Underline - <u> ... </u> or {u} ... {/u}
	Font color - <font color="color name or #code"> ... </font> (as in HTML)
	Nested tags are allowed; some implementations prefer whole-line formatting only.
	*/
	
	function processCueText(text, sanitize){
		var el = document.createElement('div'),
			dom = document.createDocumentFragment();
		el.innerHTML = text;
		if(sanitize){ el.innerHTML = el.textContent; }
		[].slice.call(el.childNodes).forEach(dom.appendChild.bind(dom));
		return dom;
	}
	
	SRTCue.prototype.getCueAsHTML = function(sanitize) {
		if(!this.DOM){
			this.DOM = processCueText(this.text,sanitize !== false);
		}
		return this.DOM.cloneNode(true);
	};
	
	function SRTtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,ms;
		hh = Math.floor(minutes/60);
		mm = (minutes%60);
		ss = (seconds%60);
		ms = Math.floor(1000*(time-seconds));
		return (hh>9?hh:"0"+hh)+":"
				+(mm>9?mm:"0"+mm)+":"
				+(ss>9?ss:"0"+ss)+","
				+(ms>99?ms:(ms>9?"0"+ms:"00"+ms));
	}
	
	function serialize(cue,index){
		return (parseInt(cue.id,10)||(index+1))+"\n"
			+SRTtime(cue.startTime)+" --> "+SRTtime(cue.endTime)
			+"\n"+cue.text.replace(/(\r?\n)+$/g,"")+"\n\n";
	}
	
	var time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*(.*)/;
	var set_pat = /X1:(\d+)\s+X2:(\d+)\s+Y1:(\d+)\s+Y2:(\d+)\s*/;

	function parse_timestamp(input){
		var ret,p,fields;
		if(input[0]===':'){throw new SyntaxError("Unexpected Colon");}
		fields = input.split(/[:,.]/);
		if(fields.length===4){
			ret = parseInt(fields[0],10)*3600+parseInt(fields[3],10)/1000;
			p = 1;
		}else{
			ret = parseInt(fields[2],10)/1000;
			p = 0;
		}
		return ret + parseInt(fields[p],10)*60 + parseInt(fields[++p],10);
	}
	
	function parse_settings(cue,line){
		var fields = set_pat.exec(line);
		if(!fields){ return; }
		cue.x1 = parseInt(fields[1],10);
		cue.x2 = parseInt(fields[2],10);
		cue.y1 = parseInt(fields[3],10);
		cue.y2 = parseInt(fields[4],10);
	}
	
	function add_cue(p,input,id,fields,cue_list){
		var s, l, cue, len=input.length;
		get_text: {
			if(	(input[p] === '\r') && //Skip CR
				(++p >= len)	){break get_text;}
			if(	(input[p] === '\n')	&& //Skip LF
				(++p >= len)	){break get_text;}
			s = p;
			do{	//Cue text loop:
				l=p; //Collect a sequence of characters that are not CR or LF characters.
				while(p < len && input[p] !== '\r' && input[p] !== '\n'){p++;}
				if(l===p){break;} //terminate on an empty line
				if(	(input[p] === '\r') && //Skip CR
					(++p >= len)	){break;}
				if(input[p] === '\n'){ ++p; } //Skip LF
			}while(p < len); 
		}
		cue = new SRTCue(
				parse_timestamp(fields[1]), //startTime
				parse_timestamp(fields[2]), //endTime
				//Replace all U+0000 NULL characters in input by U+FFFD REPLACEMENT CHARACTERs.
				input.substring(s,p).replace('\0','\uFFFD').replace(/(\r?\n)+$/g,"")
			);
		cue.id = id;
		parse_settings(cue,fields[3]);
		cue_list.push(cue);
		return p;
	}
	function parse(input){
		var line,fields,l,p,id=0,
			cue_list = [],
			len = input.length;

		//If the first character is a BYTE ORDER MARK, skip it.
		p = +(input[0] === '\uFEFF');
		
		function crlf(){
			if(	(input[p] === '\r') && //Skip CR
				(++p >= len)	){throw 0;}
			if(	(input[p] === '\n')	&& //Skip LF
				(++p >= len)	){throw 0;}
		}
		
		function collect_line(){
			l=p; //Collect a sequence of characters that are not CR or LF characters.
			while(input[p]!=='\r' && input[p] !=='\n'){
				if(++p >= len){throw 0;}
			}
		}
		
		try {
			cue_loop: do{
				/**Skip the number line**/
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p >= len){break cue_loop;}
				}
				collect_line();
				/**Get the timecode line**/
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p >= len){break cue_loop;}
				}
				collect_line();
				line = input.substring(l,p);
				if(line.indexOf('-->')===-1){
					continue cue_loop;
				}
				
				//Collect SRT cue timings
				if(fields = time_pat.exec(line)){
					p = add_cue(p,input,++id,fields,cue_list);
				}else{ //Bad cue loop:
					do{	crlf();
						collect_line();
					}while(l!==p); //Look for a blank line to terminate
				}
			}while(p < len);
		}catch(e){
			debugger;
		}finally{//End: The file has ended. The SRT parser has finished.
			return {
				cueList: cue_list,
				kind: 'subtitles',
				lang: '',
				label: ''
			};
		}
	}
	
	TimedText.mime_types['text/srt'] = {
		extension: 'srt',
		name: 'SubRip',
		cueType: SRTCue,
		parse: parse,
		serialize: function(track){
			return [].map.call(track.cues,function(cue,index){ return serialize(cue,index); }).join('');
		}
	};
}());