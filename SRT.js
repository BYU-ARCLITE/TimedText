(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
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
	
	function serialize(cue){
		return (parseInt(cue.id,10)||"0")+"\n"
			+SRTtime(cue.startTime)+" --> "+SRTtime(cue.endTime)
			+"\n"+cue.text.replace(/(\r?\n)+$/g,"")+"\n\n";
	}
	
	var time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*/;

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
	
	function add_cue(p,input,id,fields,cue_list){
		var s, l, cue, len=input.length;
		get_text: {
			if(	(input[p] === '\r') && //Skip CR
				(++p === len)	){break get_text;}
			if(	(input[p] === '\n')	&& //Skip LF
				(++p === len)	){break get_text;}
			s = p;
			do{	//Cue text loop:
				l=p; //Collect a sequence of characters that are not CR or LF characters.
				while(p < len && input[p] !== '\r' && input[p] !== '\n'){p++;}
				if(l===p){break;} //terminate on an empty line
				if(	(input[p] === '\r') && //Skip CR
					(++p === len)	){break;}
				if(input[p] === '\n'){ ++p; } //Skip LF
			}while(p < len); 
		}
		cue = new TextTrackCue(
				parse_timestamp(fields[1]), //startTime
				parse_timestamp(fields[2]), //endTime
				//Replace all U+0000 NULL characters in input by U+FFFD REPLACEMENT CHARACTERs.
				input.substring(s,p).replace('\0','\uFFFD').replace(/(\r?\n)+$/g,"")
			);
		cue.id = id;
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
				(++p === len)	){throw 0;}
			if(	(input[p] === '\n')	&& //Skip LF
				(++p === len)	){throw 0;}
		}
		
		function collect_line(){
			l=p; //Collect a sequence of characters that are not CR or LF characters.
			while(input[p]!=='\r' && input[p] !=='\n'){
				if(++p === len){throw 0;}
			}
		}
		
		try {
			cue_loop: do{
				/**Skip the number line**/
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p === len){break cue_loop;}
				}
				collect_line();
				/**Get the timecode line**/
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p === len){break cue_loop;}
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
			return cue_list;
		}
	}
	
	TimedText.mime_types['text/srt'] = {
		extension: 'srt',
		parseFile: parse,
		serializeTrack: function(data){
			if(!(data instanceof Array)){ data = data.cues; }
			data.sort(function(a,b){
				//sort first by start time, then by length
				return (a.startTime - b.startTime) || (b.endTime - a.endTime);
			});
			return data.map(function(cue){ return serialize(cue); }).join('');
		},
		serializeCue: serialize
	};
}());