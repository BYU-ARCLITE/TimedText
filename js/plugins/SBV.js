(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	var timePat = /(\d\d*):([0-5]\d):([0-5]\d)\.(\d\d\d)/;

	var SBVCue = TimedText.makeCueType(function(){});

	SBVCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = SBV2HTML(this.text);
		}
		return this.DOM.cloneNode(true);
	};

	/**HTML Manipulation Functions**/

	//strip out any html that could not have been generated from SBV
	//i.e., everything but line breaks.
	function formatHTML(node) {
		var frag;
		if(node.nodeType === Node.TEXT_NODE){
			return node.cloneNode(false);
		}
		if(node.nodeType !== Node.ELEMENT_NODE){
			return document.createDocumentFragment();
		}
		switch(node.nodeName){
		case "BR": return node.cloneNode(false);
		case "DIV":
			frag = document.createDocumentFragment();
			frag.appendChild(document.createElement('br'));
			break;
		default:
			if(node.childNodes.length === 1){
				return formatHTML(node.firstChild);
			}
			frag = document.createDocumentFragment();
		}

		[].slice.call(node.childNodes).forEach(function(cnode){
			var nnode = formatHTML(cnode);
			if(nnode && ( //drop repeated BRs- blank lines not allowed
				frag.lastChild === null ||
				frag.lastChild.nodeName !== 'BR' ||
				nnode.nodeName !== 'BR' )
			){ frag.appendChild(nnode); }
		});
		return frag;
	}

	//Turn HTML into the closest corresponding SBV text
	function HTML2SBV(parent){
		[].map.call(parent.childNodes,function(node){
			if(node.nodeType === Node.TEXT_NODE){
				return node.nodeValue.replace(/[\r\n]+/g,' ');
			}
			if(node.nodeType !== Node.ELEMENT_NODE){ return ""; }
			if(node.nodeName === 'BR'){ return "\n"; }
			return HTML2SBV(node);
		}).join('').replace(/\n\n+/g,'\n');
	}

	//Turn SBV text into the corresponding HTML
	function SBV2HTML(text){
        var DOM = document.createDocumentFragment();
		text.split(/([\r\n]+)/g)
			.forEach(function(token){
				if(/\n/.test(token)){
					DOM.appendChild(document.createElement('br'));
				}
				DOM.appendChild(document.createTextNode(token));
			});
		return DOM;
	}

	/**Serialization Functions**/

	function SBVtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,ms;
		hh = Math.floor(minutes/60);
		mm = (minutes%60);
		ss = (seconds%60);
		ms = Math.floor(1000*(time-seconds));
		return hh+":"
				+(mm>9?mm:"0"+mm)+":"
				+(ss>9?ss:"0"+ss)+"."
				+(ms>99?ms:(ms>9?"0"+ms:"00"+ms));
	}

	function serializeCue(cue){
		return 	SBVtime(cue.startTime)+','+
				SBVtime(cue.endTime)+'\n'+
				cue.text.replace(/(\r?\n)+$/g,"")+"\n\n";
	}

	function serialize(track){
		return [].map.call(track.cues,serializeCue).join('');
	}

	/**Parser Functions**/

	function parse_timestamp(input){
		var fields = timePat.exec(input);
		if(!fields){ throw 0; }
		return 	parseInt(fields[1],10)*3600 +
				parseInt(fields[2],10)*60 +
				parseInt(fields[3],10) +
				parseInt(fields[4],10)/1000;
	}

	function add_cue(p,input,id,line,cue_list){
		var s, l, cue, times, len=input.length;
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
		times = line.split(',');
		cue = new SBVCue(
				parse_timestamp(times[0]), //startTime
				parse_timestamp(times[1]), //endTime
				input.substring(s,p).replace(/(\r?\n)+$/g,"")
			);
		cue.id = id;
		cue_list.push(cue);
		return p;
	}

	function parse(input){
		var line,l,p,id=0,
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
				/**Get the timecode line**/
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p >= len){break cue_loop;}
				}
				collect_line();
				line = input.substring(l,p);
				if(line.indexOf(',')===-1){
					continue cue_loop;
				}
				/**Get the cue body**/
				try{
					p = add_cue(p,input,String(++id),line,cue_list);
				}catch(_){ //Bad cue loop:
					do{	crlf();
						collect_line();
					}while(l!==p); //Look for a blank line to terminate
				}
			}while(p < len);
		}catch(e){
			debugger;
		}finally{//End: The file has ended. The SBV parser has finished.
			return {
				cueList: cue_list,
				kind: 'subtitles',
				lang: '',
				label: ''
			};
		}
	}

	TimedText.registerType('text/subtitle+sbv', {
		extension: 'sbv',
		name: 'YouTube Subtitles',
		cueType: SBVCue,
		isCueCompatible: function(cue){ return cue instanceof SBVCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2SBV,
		positionCue: null,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));