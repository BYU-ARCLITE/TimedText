//https://wiki.videolan.org/SubViewer
(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	var timePat = /(\d\d+):([0-5]\d):([0-5]\d)\.(\d\d)/;
	var startPat = /^\d\d+:[0-5]\d:[0-5]\d\.\d\d/g;

	var SUBCue = TimedText.makeCueType(function(){});

	SUBCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = SUB2HTML(this.text);
		}
		return this.DOM.cloneNode(true);
	};

	/**HTML Manipulation Functions**/

	//strip out any html that could not have been generated from SUB
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

	//Turn HTML into the closest corresponding SUB text
	function HTML2SUB(parent){
		[].map.call(parent.childNodes,function(node){
			if(node.nodeType === Node.TEXT_NODE){
				return node.nodeValue.replace(/[\r\n]+/g,' ');
			}
			if(node.nodeType !== Node.ELEMENT_NODE){ return ""; }
			if(node.nodeName === 'BR'){ return "[br]"; }
			return HTML2SUB(node);
		}).join('');
	}

	//Turn SUB text into the corresponding HTML
	function SUB2HTML(text){
        var DOM = document.createDocumentFragment();
		text.split(/\[br\]/g)
			.forEach(function(token){
				if(token === '[br]'){
					DOM.appendChild(document.createElement('br'));
				}
				DOM.appendChild(document.createTextNode(token.replace(/[\r\n]+/g,' ')));
			});
		return DOM;
	}

	/**Serialization Functions**/

	function SUBtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,cs;
		hh = Math.floor(minutes/60);
		mm = (minutes%60);
		ss = (seconds%60);
		cs = Math.floor(100*(time-seconds));
		return (hh>9?hh:"0"+hh)+":"
				+(mm>9?mm:"0"+mm)+":"
				+(ss>9?ss:"0"+ss)+","
				+(cs>9?cs:"0"+cs);
	}

	function serializeCue(cue){
		return 	SUBtime(cue.startTime)+','+
				SUBtime(cue.endTime)+'\n'+
				cue.text.replace(/(\r?\n)+$/g,"")+"\n\n";
	}

	function serialize(track){
		//INFORMATION section is optional, se we leave it out.
		return "[SUBTITLE]\n"+[].map.call(track.cues,serializeCue).join('');
	}

	/**Parser Functions**/

	function parse_timestamp(input){
		var fields = timePat.exec(input);
		if(!fields){ throw 0; }
		return 	parseInt(fields[1],10)*3600 +
				parseInt(fields[2],10)*60 +
				parseInt(fields[3],10) +
				parseInt(fields[4],10)/100;
	}

	function add_cue(p,input,id,delay,line,cue_list){
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
		cue = new SUBCue(
				parse_timestamp(times[0])+delay, //startTime
				parse_timestamp(times[1])+delay, //endTime
				input.substring(s,p).replace(/(\r?\n)+$/g,"")
			);
		cue.id = id;
		cue_list.push(cue);
		return p;
	}

	function getDelay(input){
		var match = /\[DELAY\]\s*(\d+)/.exec(input);
		if(!match){ return 0; }
		return parseInt(match[1],10)/24; //assume 24 fps
	}

	function getTitle(input){
		var match = /\[TITLE\]\s*(.*?)\s*/.exec(input);
		if(!match){ return ""; }
		return match[1];
	}

	function getStart(input){
		var match;
		startPat.lastIndex = 0;
		match = startPat.exec(input);
		if(!match){ return input.length; }
		return startPat.lastIndex - match[0].length;
	}

	function parse(input){
		var line,l,p,
			delay,title,id=0,
			cue_list = [],
			len = input.length;

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

		//Delay & Title are the only header fields that we care about
		delay = getDelay(input);
		title = getTitle(input);

		//Skip the rest of any header that might exist
		p = getStart(input);

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
					p = add_cue(p,input,String(++id),delay,line,cue_list);
				}catch(_){ //Bad cue loop:
					do{	crlf();
						collect_line();
					}while(l!==p); //Look for a blank line to terminate
				}
			}while(p < len);
		}catch(e){
			debugger;
		}finally{//End: The file has ended. The SUB parser has finished.
			return {
				cueList: cue_list,
				kind: 'subtitles',
				lang: '',
				label: title
			};
		}
	}

	TimedText.registerType('text/subtitle+sub', {
		extension: 'sub',
		name: 'SubViewer 2.0',
		cueType: SUBCue,
		isCueCompatible: function(cue){ return cue instanceof SUBCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2SUB,
		positionCue: null,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));