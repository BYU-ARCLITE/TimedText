(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	var time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d[,.]\d{3})\s*(.*)/;
	var set_pat = /X1:(\d+)\s+X2:(\d+)\s+Y1:(\d+)\s+Y2:(\d+)\s*/;

	var SRTCue = TimedText.makeCueType(function(){
		this.x1 = null;
		this.x2 = null;
		this.y1 = null;
		this.y2 = null;
	});

	/*
	Bold - <b> ... </b> or {b} ... {/b}
	Italic - <i> ... </i> or {i} ... {/i}
	Underline - <u> ... </u> or {u} ... {/u}
	Font color - <font color="color name or #code"> ... </font> (as in HTML)
	*/

	function processCueText(input){
        var DOM = document.createDocumentFragment(),
			current = DOM,
			stack = [];

		input
			.split(/(<\/?[^>]+>|\{\/?[biu]\})/ig)
			.filter(function(cuePortionText){
				return !!cuePortionText.replace(/\s*/ig,"");
			}).forEach(function(token){
			var tag, ttype, chunk, node, frags;
			ttype = token[0];
			if(ttype !== "<" && ttype !=="{"){ // Text string
				frags = token.replace(/\n\r/g,'\n').split(/\n(?!$)/g);
				frags.forEach(function(frag){
					current.appendChild(document.createTextNode(frag));
					current.appendChild(document.createElement('br'));
				});
				current.removeChild(current.lastChild);
			}else if(token[1] === "/" && ttype === stack[stack.length-1]){ //Closing tag
				tag = token.match(/<\/([^\s>]+)/)[1].toUpperCase();
				if(tag === current.nodeName){
					current = current.parentNode;
					//remove empty nodes
					if(current.lastChild.childNodes.length === 0){
						current.removeChild(current.lastChild);
					}
					stack.pop();
				}
				// else tag mismatch; ignore.
			}else{ //Opening tag
				if(chunk = token.match(/[<{]font\s+color="([^"]+)"\s*[>}]/i)){
					node = document.createElement('span');
					node.style.color = chunk[1];
					stack.push(ttype);
				}else if(chunk = token.match(/[<{](b|i|u)[>}]/)){
					node = document.createElement(chunk[1]);
					stack.push(ttype);
				}else{
					return;
				}
				current.appendChild(node);
				current = node;
			}
		});
		return DOM;
	}

	SRTCue.prototype.getCueAsHTML = function(){
		if(!this.DOM){
			this.DOM = processCueText(this.text);
		}
		return this.DOM.cloneNode(true);
	};

	//strip out any html that could not have been generated from SRT
	function formatHTML(node){
		var tag, frag;
		if(node.nodeType === Node.TEXT_NODE){ return node; }
		if(node.nodeType === Node.ELEMENT_NODE){
			tag = node.nodeName;
			switch(tag){
			case "BR": return node.cloneNode(false);
			case "DIV":
				frag = document.createDocumentFragment();
				frag.appendChild(document.createElement('br'));
				break;
			case "I": case "U": case "B":
				frag = document.createElement(tag);
				break;
			case "FONT":
				frag = document.createElement(tag);
				frag.setAttribute('color', node.getAttribute('color'));
				break;
			default:
				//this is where invalid tags are dropped
				if(node.childNodes.length === 1){
					return formatHTML(node.firstChild);
				}
				frag = document.createDocumentFragment();
			}
		}
		[].slice.call(node.childNodes).forEach(function(cnode){
			var nnode = formatHTML(cnode);
			if( //drop repeated BRs- blank lines not allowed
				frag.lastChild === null ||
				frag.lastChild.nodeName !== 'BR' ||
				nnode.nodeName !== 'BR'
			){ frag.appendChild(nnode); }
		});
		return frag;
	}

	function HTML2SRT(node){
		return [].map.call(node.childNodes, HTML2SRTr)
			.join('') //replace ensures no blank lines are exported
			.replace(/(\r\n){2,}/g,'\r\n');
	}

	function HTML2SRTr(node){
		var tag, innertxt;
		if(node.nodeType === Node.TEXT_NODE){
			return node.nodeValue.replace(/[\r\n]+/g,' ');
		}

		innertxt = [].map.call(node.childNodes, HTML2SRTr).join('');

		if(node.nodeType === Node.ELEMENT_NODE){
			tag = node.nodeName;
			switch(tag){
			case "BR": return "\r\n";
			case "DIV": return "\r\n"+innertxt;
			case "I": case "U": case "B":
				return "<"+tag+">"+innertxt+"</"+tag+">";
			}
		}

		//ignore unrecognized tags & node types
		return innertxt;	
	}

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

	function serializeCue(cue,index){
		return (parseInt(cue.id,10)||(index+1))+"\n"
			+ SRTtime(cue.startTime)+" --> "+SRTtime(cue.endTime)
			+ (typeof cue.x1 === 'number'?(" X1:"+cue.x1+" X2:"+cue.x2+" Y1:"+cue.y1+" Y2:"+cue.y2+"\n"):"\n")
			+ cue.text.replace(/(\r?\n)+$/g,"")+"\n\n";
	}

	function serialize(track){
		return [].map.call(track.cues,function(cue,index){
			return serializeCue(cue,index);
		}).join('');
	}

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
					p = add_cue(p,input,String(++id),fields,cue_list);
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

	/* applyStyles(DOMNode, Style Object)
		A fast way to apply multiple CSS styles to a DOMNode
		First parameter: DOMNode to style
		Second parameter: An object where the keys are camel-cased CSS property names
	*/
	function applyStyles(Node, styleObject){
		var style = Node.style;
		Object.keys(styleObject).forEach(function(styleName){
			style[styleName] = styleObject[styleName];
		});
	}

	function positionCue(rendered, availableCueArea, videoMetrics){
		var DOMNode = rendered.node,
			cueObject = rendered.cue,
			cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0,
			baseFontSize, basePixelFontSize, baseLineHeight, pixelLineHeight;

		baseFontSize = Math.max(((videoMetrics.height * 0.045)/96)*72, 10);

		if(typeof cueObject.x1 === 'number'){
			applyStyles(DOMNode,{
				position: "absolute",
				unicodeBidi: "plaintext",
				overflow: "hidden",
				top: cueObject.y1 + "px",
				bottom: cueObject.y2 + "px",
				left: cueObject.x1 + "px",
				right: cueObject.x2 + "px",
				padding: Math.floor(videoMetrics.height/100) + "px 0px",
				textAlign: "center",
				direction: TimedText.getTextDirection(""+cueObject.text),
				fontSize: baseFontSize,
				boxSizing: "border-box"
			});
			while(DOMNode.scrollHeight > DOMNode.offsetHeight){
				baseFontSize = Math.floor(2 * baseFontSize * DOMNode.offsetHeight / DOMNode.scrollHeight)/2;
				DOMNode.fontSize = baseFontSize + "px";
			}
		}else{
			// Calculate font metrics
			basePixelFontSize = Math.floor((baseFontSize/72)*96);
			baseLineHeight = Math.max(Math.floor(baseFontSize * 1.2), 14);
			pixelLineHeight = Math.ceil((baseLineHeight/72)*96);

			if(pixelLineHeight * Math.floor(videoMetrics.height / pixelLineHeight) < videoMetrics.height){
				pixelLineHeight = Math.floor(videoMetrics.height / Math.floor(videoMetrics.height / pixelLineHeight));
				baseLineHeight = Math.ceil((pixelLineHeight/96)*72);
			}

			cueWidth = availableCueArea.width;
			cueX = ((availableCueArea.right - cueWidth)/2) + availableCueArea.left;

			applyStyles(DOMNode,{
				display: "inline-block",
				position: "absolute",
				unicodeBidi: "plaintext",
				overflow: "hidden",
				height: pixelLineHeight + "px", //so the scrollheight has a baseline to work from
				width: cueWidth + "px",
				left: cueX + "px",
				padding: "0px " + Math.floor(videoMetrics.width/100) + "px",
				textAlign: "center",
				direction: TimedText.getTextDirection(DOMNode.textContent),
				lineHeight: baseLineHeight + "pt",
				boxSizing: "border-box"
			});

			cueHeight = Math.round(DOMNode.scrollHeight/pixelLineHeight)*pixelLineHeight;
			cueY = availableCueArea.height + availableCueArea.top - cueHeight;
			DOMNode.style.height = cueHeight + "px";
			DOMNode.style.top = cueY + "px";

			// Work out how to shrink the available render area
			// If subtracting from the bottom works out to a larger area, subtract from the bottom.
			// Otherwise, subtract from the top.
			if((cueY - 2*availableCueArea.top) >=
				(availableCueArea.bottom - (cueY + cueHeight)) &&
				availableCueArea.bottom > cueY){
				availableCueArea.bottom = cueY;
			}else if(availableCueArea.top < cueY + cueHeight){
				availableCueArea.top = cueY + cueHeight;
			}
			availableCueArea.height = availableCueArea.bottom - availableCueArea.top;
		}
	}

	TimedText.registerType('text/srt', {
		extension: 'srt',
		name: 'SubRip',
		cueType: SRTCue,
		isCueCompatible: function(cue){ return cue instanceof SRTCue; },
		formatHTML: formatHTML,
		textFromHTML: HTML2SRT,
		positionCue: positionCue,
		updateCueTime: null,
		updateCueContent: null,
		attachEditor: null,
		parse: parse,
		serialize: serialize
	});
}(window.TimedText));