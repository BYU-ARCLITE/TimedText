/*
http://www.whatwg.org/specs/web-apps/current-work/webvtt.html
*/
(function(){
	"use strict";
	
	if(!TimedText){ throw new Error("TimedText not defined."); }
	
	var allowedDirs = {'':true,'rl':true,'lr':true},
		allowedAlign = {'start':true,'middle':true,'end':true,'left':true,'right':true};
	
		
	function validate_percentage(value){
		var number = /^\d+%$/.test(value)?parseInt(value,10):+value;
		if((typeof number === 'number') && number>=0 && number<=100){
			return number;
		}
		throw new SyntaxError("Invalid Percentage");
	}
	
	var WebVTTCue = TimedText.makeCueType(function(){
		var dir = '',
			snapToLines = true,
			line = "auto",
			position = 50,
			size = 100,
			align = "middle";
			
		Object.defineProperties(this,{
			snapToLines: { get: function(){ return snapToLines; }, enumerable: true },
			vertical: {
				set: function(value){
					if(allowedDirs.hasOwnProperty(value)){ return (dir = value); }
					throw new SyntaxError("Invalid Writing Direction");
				},get: function(){return dir;},
				enumerable: true
			},
			align: {
				set: function(value){
					if(allowedAlign.hasOwnProperty(value)){ return align=value; }
					throw new SyntaxError("Invalid value for align attribute.");
				},get: function(){return align;},
				enumerable: true
			},
			line: {
				set: function(value){
					var number;
					if(typeof value === 'number'){
						snapToLines = true;
						line = value+"";
					}else if(value==='auto'){
						snapToLines = true;
						line = 'auto';
					}else if(/^-?\d+%?$/.test(value)){
						number = parseInt(value,10);
						if(value[value.length-1] === '%'){	//If the last character in value is %
							if(number<0 || number>100){ throw new SyntaxError("Invalid Percentage"); }
							snapToLines = false;
							line = number + "%";
						}else{
							snapToLines = true;
							line = ""+number;
						}
					}else{
						throw new SyntaxError("Invalid Line Position");
					}
					return line;
				},get: function(){return line;},
				enumerable: true
			},
			size: {
				set: function(value){ return size = validate_percentage(value); },
				get: function(){return size;},
				enumerable: true
			},
			position: {
				set: function(value){ return position = validate_percentage(value); },
				get: function(){return position;},
				enumerable: true
			}
		});
	});
	
	//http://dev.w3.org/html5/webvtt/#webvtt-cue-text-dom-construction-rules
	function createTimestampNode(timeData){
		var node,
			hh = parseInt(timeData[1],10)|| 0,
			mm = parseInt(timeData[2],10) || 0,
			ss = parseInt(timeData[3],10) || 0,
			ms = parseFloat("0."+timeData[4]);
			
		node = document.createElement('i');
		node.dataset.target = "timestamp";
		node.dataset.seconds = hh*3600+mm*60+ss+ms;
		
		ms *= 1000;
		node.dataset.timestamp = (hh>9?hh:"0"+hh)+":" +
					(mm>9?mm:"0"+mm)+":" +
					(ss>9?ss:"0"+ss)+"." +
					(ms>99?ms:(ms>9?"0"+ms:"00"+ms));
		return node;
	}
	
	function hasRealTextContent(textInput) {
		return !!textInput.replace(/[^a-z0-9]+/ig,"").length;
	}
	
	function processCaptionHTML(inputHTML,sanitize) {
		var DOM = document.createDocumentFragment(),
			current = DOM,
			stack = [],
			lang = "";
		
		inputHTML
			.split(/(<\/?[^>]+>)/ig)
			.filter(function(cuePortionText) {
				return !!cuePortionText.replace(/\s*/ig,"");
			}).forEach(function(token) {
			var tag, chunk, node, frags;
			if (token[0] !== "<") { // Text string
				if(sanitize){
					frags = token.replace(/\n\r/g,'\n').split(/\n(?!$)/g);
					frags.forEach(function(frag){
						current.appendChild(document.createTextNode(frag));
						current.appendChild(document.createElement('br'));
					});
					current.removeChild(current.lastChild);
				}else{
					current.appendChild(document.createTextNode(token));
				}
			}else if (token[1] === "/") { //Closing tag
				tag = token.match(/<\/([^\s>]+)/)[1].toUpperCase();
				if(tag === current.nodeName || (current.dataset && tag === current.dataset.cuetag)){
					if(tag === 'LANG'){ lang = stack.pop(); }
					current = current.parentNode;
				}
				// else tag mismatch; ignore.
			} else { //Opening tag
				if(chunk = token.match(/<(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)/)){
					current.appendChild(createTimestampNode(chunk));
					return;
				}else if(chunk = token.match(/<v\s+([^>]+)>/i)){
					node = document.createElement('span');
					node.title = node.dataset.voice = chunk[1].replace(/[\"]/g,"");
					node.dataset.cuetag = "V";
				}else if(token.match(/<c[a-z0-9\-\_\.]+>/i)){
					node = document.createElement('span');
					node.className = token.replace(/[<\/>\s]+/ig,"")
										.split(/[\.]+/ig)
										.slice(1)
										.filter(hasRealTextContent).join(' ');
					node.dataset.cuetag = "C";
				}else if(chunk = token.match(/<lang\s+([^>]+)>/i)){
					node = document.createElement('span');
					node.dataset.cuetag = "LANG";
					stack.push(lang);
					lang = chunk[1];
				}else if(chunk = token.match(sanitize?/<(b|i|u|ruby|rt)>/:/<(\w+)>/)){
					node = document.createElement(chunk[1]);
				}else{
					return;
				}
				if(lang){ node.lang = lang; }
				current.appendChild(node);
				current = node;
			}
		});
		return DOM;
	}
	
	WebVTTCue.prototype.getCueAsHTML = function() {
		if(!this.DOM){
			this.DOM = processCaptionHTML(this.text,!(this.track && this.track.kind === 'html'));
		}
		return this.DOM.cloneNode(true);
	};
	
	//var WebVTTDEFAULTSCueParser		= /^DEFAULTS?\s+\-\-\>\s+(.*)/g;
	//var WebVTTSTYLECueParser		= /^STYLES?\s+\-\-\>\s*\n([\s\S]*)/g;
	//var WebVTTCOMMENTCueParser		= /^COMMENTS?\s+\-\-\>\s+(.*)/g;
	
	var set_pat = /(align|vertical|line|size|position):(\S+)/g,
		ar_set_pat = /([DLTAS]):(\S+)/g,
		ar_set_map = {"D":"direction","L":"line","T":"position","A":"align","S":"size"},
		direction_map = {'horizontal':'','vertical-lr':'lr','vertical':'rl'},
		time_pat = /^\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*(.*)/;

	function VTTtime(time){
		var seconds = Math.floor(time),
			minutes = Math.floor(seconds/60),
			hh,mm,ss,ms,text;
		hh = Math.floor(minutes/60);
		mm = (minutes%60);
		ss = (seconds%60);
		ms = Math.floor(1000*(time-seconds));
		text = (hh>0?(hh>9?hh:"0"+hh)+":":"");
		return text+(mm>9?mm:"0"+mm)+":"+(ss>9?ss:"0"+ss)+"."+(ms>99?ms:(ms>9?"0"+ms:"00"+ms));
	}
	
	function serialize(cue){
		var text = (cue.id?cue.id+"\r\n":"")
			+VTTtime(cue.startTime)+" --> "+VTTtime(cue.endTime);
		if(cue.vertical !== ''){ text+=" vertical:"+cue.vertical; }
		if(cue.align !== 'middle'){ text+=" align:"+cue.align; }
		if(cue.line !== 'auto'){ text+=" line:"+cue.line; }
		if(cue.size !== 100){ text+=" line:"+cue.size+"%"; }
		if(cue.position !== 50){ text+=" position:"+cue.position+"%"; }
		return text+"\r\n"+cue.text.replace(/(\r?\n)+$/g,"")+"\r\n\r\n";
	}
	
	function parse_timestamp(input){
		var ret,p,fields;
		if(input[0]===':'){throw new SyntaxError("Unexpected Colon");}
		fields = input.split(/[:.]/);
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
		var fields, setting;
		set_pat.lastIndex = 0;
		while(!!(fields = set_pat.exec(line))){
			cue[fields[1]] = fields[2];
		}
		//archaic settings;
		ar_set_pat.lastIndex = 0;
		while(!!(fields = ar_set_pat.exec(line))){
			setting = ar_set_map[fields[1]];
			if(setting === 'direction'){
				cue.vertical = direction_map[fields[2]];
			}else{
				cue[setting] = fields[2];
			}
		}
	}
	
	function add_cue(p,input,id,fields,cue_list){
		var s, l, e, len=input.length, cue;
		get_text: {
			if(	(input[p] === '\r') && //Skip CR
				(++p >= len)	){break get_text;}
			if(	(input[p] === '\n')	&& //Skip LF
				(++p >= len)	){break get_text;}
			s = p;
			do{	//Cue text loop:
				l = p; //Collect a sequence of characters that are not CR or LF characters.
				while(p < len && input[p] !== '\r' && input[p] !== '\n'){p++;}
				e = p;
				if(l===p){break;} //terminate on an empty line
				if(	(input[p] === '\r') && //Skip CR
					(++p >= len)	){break;}
				if(input[p] === '\n'){ ++p; } //Skip LF
			}while(p < len); 
		}
		//Cue text processing:
		//This where the spec says we ought to construct the cue-text DOM;
		//we actually implement that in the WebVTTCue getCueAsHTML method.
		cue = new WebVTTCue(
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
	
	function parse_cues(input,p){
		var line,l,id,fields,
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
		
		try {
			cue_loop: do{
				//Skip CR & LF characters.
				while(input[p]==='\r' || input[p]==='\n'){
					if(++p >= len){break cue_loop;}
				}
				collect_line();
				line = input.substring(l,p);
				//If line does not contain "-->", treat it as an id & get a new line
				if(line.indexOf('-->')===-1){
					crlf();
					collect_line();
					if(l===p){continue cue_loop;} //If line is the empty string, start over.
					id = line; //Let cue's text track cue identifier be the previous line.
					line = input.substring(l,p);
				}else{id = '';}
				
				//Collect WebVTT cue timings and settings from line
				if(fields = time_pat.exec(line)){
					p = add_cue(p,input,id,fields,cue_list);
				}else{ //Bad cue loop:
					do{	crlf();
						collect_line();
					}while(l!==p); //Look for a blank line to terminate
				}
			}while(p < len);
		}finally{//End: The file has ended. The WebVTT parser has finished.
			return cue_list;
		}
	}

	function parse(input){
		var line, l, p, cueList,
			len = input.length;

		//If the first character is a BYTE ORDER MARK, skip it.
		l = p = +(input[0] === '\uFEFF');
		//Collect a sequence of chars that are not CR or LF.
		while(p < len && input[p] !== '\r' && input[p] !== '\n'){p++;}
		//If line is less than 6 chars long, this is not a WebVTT file.
		if(p-l<6){throw new Error("Not WebVTT Data");}
		line = input.substring(l,p);
		//If the first 6 chars !== "WEBVTT", or line > 6 chars long
		//and the 7th char is neither U+0020 SPACE nor U+0009 TABULATION, this is not a WebVTT file.
		if(!/^WEBVTT([\u0020\u0009].*|$)/.test(line)){throw new Error("Not WebVTT Data");}
		
		//If position is past the end of input, end.
		if(p < len) parseCues: {
			do{	//Header:
				if(	(input[p] === '\r') && //Skip CR
					(++p >= len)	){break parseCues;}
				if(	(input[p] === '\n')	&& //Skip LF
					(++p >= len)	){break parseCues;}
				l=p; //Collect a sequence of characters that are not CR or LF characters.
				while(input[p] !== '\r' && input[p] !== '\n'){
					if(++p >= len){break parseCues;}
				}
			}while(l!==p);	//Look for an empty line to finish the header
			cueList = parse_cues(input,p);
		}
		return {
			cueList: cueList || [],
			kind: 'subtitles',
			lang: '',
			label: ''
		};	
	}
	
	var positionCue = (function(){
	
		/* applyStyles(DOMNode, Style Object)
			A fast way to apply multiple CSS styles to a DOMNode
			First parameter: DOMNode to style
			Second parameter: An object where the keys are camel-cased CSS property names
		*/
		function applyStyles(Node, styleObject) {
			var style = Node.style;
			Object.keys(styleObject).forEach(function(styleName){
				style[styleName] = styleObject[styleName];
			});
		}
	
		// Function to facilitate vertical text alignments in browsers which do not support writing-mode
		// (sadly, all the good ones!)
		function spanify(DOMNode,fontSize,lineHeight,chars) {
			var characterCount = 0,
				templateNode = document.createElement('span');
			templateNode.dataset['cue-char'] = true;
			applyStyles(templateNode,{
				position: "absolute",
				display: "block",
				lineHeight: "auto",
				textAlign: "center",
				height:	fontSize + "px",
				width:	lineHeight + "px"
			});
			[].forEach.call(DOMNode.childNodes,function(currentNode,nodeIndex) {
				var replacementNode;
				if (currentNode.nodeType === 3) {
					replacementNode = document.createElement("span");
					currentNode.nodeValue
							.split(/(.)/)
							.forEach(function(s){
								if(!s.length){ return; }
								var ch = templateNode.cloneNode(false);
								ch.textContent = s;
								replacementNode.appendChild(ch);
								chars.push(ch)
							});
					currentNode.parentNode.replaceChild(replacementNode,currentNode);
				} else if (DOMNode.childNodes[nodeIndex].nodeType === 1) {
					spanify(DOMNode.childNodes[nodeIndex],fontSize,lineHeight,chars);
				}
			});
			return chars;
		}
		
		function getspanchars(DOMNode,fontSize,lineHeight) {
			var charElements = DOMNode.querySelectorAll('span[cue-char]');
			return charElements.length?[].slice.apply(charElements):spanify(DOMNode,fontSize,lineHeight,[]);
		}
		
		return function(rendered, availableCueArea, videoMetrics) {
			// Variables for maintaining render calculations
			var DOMNode = rendered.node,
				cueObject = rendered.cue,
				cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0, cuePaddingLR = 0, cuePaddingTB = 0,
				cueSize, cueLine, cueVertical = cueObject.vertical, cueSnap = cueObject.snapToLines, cuePosition = cueObject.position,
				baseFontSize, basePixelFontSize, baseLineHeight,
				pixelLineHeight, verticalPixelLineHeight;

			// Calculate font metrics
			baseFontSize = Math.max(((videoMetrics.height * 0.045)/96)*72, 10);
			basePixelFontSize = Math.floor((baseFontSize/72)*96);
			baseLineHeight = Math.max(Math.floor(baseFontSize * 1.2), 14);
			pixelLineHeight = Math.ceil((baseLineHeight/72)*96);
			verticalPixelLineHeight	= pixelLineHeight;
			
			if (pixelLineHeight * Math.floor(videoMetrics.height / pixelLineHeight) < videoMetrics.height) {
				pixelLineHeight = Math.floor(videoMetrics.height / Math.floor(videoMetrics.height / pixelLineHeight));
				baseLineHeight = Math.ceil((pixelLineHeight/96)*72);
			}
			
			if (pixelLineHeight * Math.floor(videoMetrics.width / pixelLineHeight) < videoMetrics.width) {
				verticalPixelLineHeight = Math.ceil(videoMetrics.width / Math.floor(videoMetrics.width / pixelLineHeight));
			}
						
			if (cueVertical === "") {
				DOMNode.style.display = "inline-block";
				cuePaddingLR = Math.floor(videoMetrics.width/100);
			}else{
				cuePaddingTB = Math.floor(videoMetrics.height/100);
			}
			
			//http://dev.w3.org/html5/webvtt/#applying-css-properties-to-webvtt-node-objects
			//not quite perfect compliance, but close, especially given vertical-text hacks
			applyStyles(DOMNode,{
				position: "absolute",
				unicodeBidi: "plaintext",
				overflow: "hidden",
				height: pixelLineHeight + "px", //so the scrollheight has a baseline to work from
				padding: cuePaddingTB + "px " + cuePaddingLR + "px",
				textAlign: (cueVertical !== "")?"":(cueObject.align === "middle"?"center":cueObject.align),
				direction: TimedText.getTextDirection(DOMNode.textContent),
				lineHeight: baseLineHeight + "pt",
				boxSizing: "border-box"
			});	
			
			cueSize = cueObject.size;			
			if (cueVertical === "") {
				cueWidth = (cueLine === 'auto'?availableCueArea:videoMetrics).width * cueSize/100;
				cueX = ((availableCueArea.right - cueWidth) * (cuePosition/100)) + availableCueArea.left;
				DOMNode.style.width = cueWidth + "px";
				DOMNode.style.left = cueX + "px";
				
				if (cueSnap) {
					cueHeight = Math.round(DOMNode.scrollHeight/pixelLineHeight)*pixelLineHeight;
					if(cueObject.line === 'auto'){
						cueY = availableCueArea.height + availableCueArea.top - cueHeight;
					}else{
						cueLine = parseFloat(cueObject.line);
						cueY = cueLine < 0
								?videoMetrics.height-cueHeight+(1+cueLine)*pixelLineHeight
								:cueLine*pixelLineHeight;
					}
				} else {
					cueHeight = DOMNode.scrollHeight;
					cueLine = parseFloat(cueObject.line);
					cueY = (videoMetrics.height - cueHeight - 2*cuePaddingTB) * (cueLine/100);
				}
				DOMNode.style.height = cueHeight + "px";
				DOMNode.style.top = cueY + "px";
				
				// Work out how to shrink the available render area
				// If subtracting from the bottom works out to a larger area, subtract from the bottom.
				// Otherwise, subtract from the top.
				if ((cueY - 2*availableCueArea.top) >=
					(availableCueArea.bottom - (cueY + cueHeight)) &&
					availableCueArea.bottom > cueY) {
					availableCueArea.bottom = cueY;
				} else if (availableCueArea.top < cueY + cueHeight) {
					availableCueArea.top = cueY + cueHeight;
				}
				availableCueArea.height = availableCueArea.bottom - availableCueArea.top;
				
			} else {
				cueHeight = availableCueArea.height * (cueSize/100);
				// Work out CueY taking into account textPosition...
				cueY = ((availableCueArea.bottom - cueHeight) * (cuePosition/100)) + 
						availableCueArea.top;
				
				(function(){	// Split into characters, and continue calculating width & positioning with new info
					var currentLine = 0, characterPosition = 0,
						characters = getspanchars(DOMNode,basePixelFontSize,verticalPixelLineHeight),
						characterCount = characters.length,
						charactersPerLine = Math.floor((cueHeight-cuePaddingTB*2)/basePixelFontSize),
						lineCount = Math.ceil(characterCount/charactersPerLine),
						finalLineCharacterCount = characterCount - (charactersPerLine * (lineCount - 1)),
						finalLineCharacterHeight = finalLineCharacterCount * basePixelFontSize;
					
					cueWidth = Math.ceil(characterCount/charactersPerLine) * verticalPixelLineHeight;
					
					// Work out CueX taking into account linePosition...
					if (cueSnap) {
						if(cueObject.line === 'auto'){
							cueX = (cueVertical === "lr" ? availableCueArea.left : availableCueArea.right - cueWidth);
						}else{
							cueLine = parseFloat(cueObject.line);
							cueX = cueVertical === (cueLine < 0 ? "lr" : "rl")
									? videoMetrics.width-cueWidth+(1+cueLine)*verticalPixelLineHeight : cueLine*vertcialPixelLineHeight;
						}
					} else {
						cueLine = parseFloat(cueObject.line);
						cueX = ((videoMetrics.width - (cueWidth + (cuePaddingLR * 2))) * (cueVertical === "lr"?cueLine/100:1-cueLine/100));
					}						
					
					// Iterate through the characters and position them accordingly...
					characters.forEach(function(characterSpan) {
						var characterY,
							characterX = (cueVertical === "lr")
								?verticalPixelLineHeight * currentLine:cueWidth - (verticalPixelLineHeight * (currentLine+1));
						
						if(currentLine < (lineCount-1)) {
							characterY = (characterPosition * basePixelFontSize) + cuePaddingTB;
						}else switch(cueObject.align){
							case "start":
							case "right": //hack
								characterY = (characterPosition * basePixelFontSize) + cuePaddingTB;
								break;
							case "end":
							case "left":
								characterY = ((characterPosition * basePixelFontSize)-basePixelFontSize) + ((cueHeight+(cuePaddingTB*2))-finalLineCharacterHeight);
								break;
							case "middle":
								characterY = (((cueHeight - (cuePaddingTB*2))-finalLineCharacterHeight)/2) + (characterPosition * basePixelFontSize);
						}
						
						characterSpan.style.top = characterY + "px";
						characterSpan.style.left = characterX + "px";
						
						if (characterPosition >= charactersPerLine-1) {
							characterPosition = 0;
							currentLine ++;
						} else {
							characterPosition ++;
						}
					});
				}());
				
				applyStyles(DOMNode,{
					width: cueWidth + "px",
					height: cueHeight + "px",
					left: cueX + "px",
					top: cueY + "px"
				});
				
				// Work out how to shrink the available render area
				// If subtracting from the right works out to a larger area, subtract from the right.
				// Otherwise, subtract from the left.	
				if (((cueX - availableCueArea.left) - availableCueArea.left) >=
					(availableCueArea.right - (cueX + cueWidth))) {
					availableCueArea.right = cueX;
				} else {
					availableCueArea.left = cueX + cueWidth;
				}
				availableCueArea.width = availableCueArea.right - availableCueArea.left;
			}
		};
	}());
	
	var updateCueTime = (function(){
		function set_node_time(node,pos){
			var newnode;
			switch(node.nodeType){
				case Node.TEXT_NODE:
					newnode = document.createElement('span');
					node.parentNode.replaceChild(newnode,node);
					newnode.appendChild(node);
					node = newnode;
				case Node.ELEMENT_NODE:
					node.dataset['time-position'] = pos;
			}
		}
			
		function markTimes(DOM,currentTime){
			//depth-first traversal of the cue DOM
			var i, node, time, children, timeNodes,
				pastNode = null,
				futureNode = null;
				
			//find the last timestamp in the past and the first in the future
			timeNodes = DOM.querySelectorAll("i[data-target=timestamp]");
			if(timeNodes.length === 0){ return 0; }
			for(i=0;node=timeNodes[i];i++){
				time = node.dataset.seconds;
				if(time < currentTime){ pastNode = node; }
				else if(time > currentTime){ futureNode = node; break; }
			}
			//mark nodes as past or future appropriately
			children = [].slice.call(DOM.childNodes,0);		
			while(children.length){
				node = children.pop();
				if(pastNode && node.compareDocumentPosition(pastNode) === 4){ //pastNode is following
					set_node_time(node,"past");
				}else if(futureNode && node.compareDocumentPosition(futureNode) === 2){ //futureNode is preceding
					set_node_time(node,"future");
				}else{
					set_node_time(node,"present");
				}
				if(node.childNodes){ children.push.apply(children,node.childNodes); }
			}
			return pastNode?pastNode.dataset.seconds:"";
		}
			
		function timeStyle(node){ //TODO: read stylesheets
			[].forEach.call(node.querySelectorAll('[data-time-position]'),function(element){
				switch(node.dataset['time-position']){
				case "past":
					element.style.visibility = "hidden";
				case "present":
				case "future":
					element.style.visibility = "";
				}
			});
		}
		
		return function(renderedCue, time){
			var newTime = markTimes(renderedCue.node,time);
			if(renderedCue.time === newTime){ return false; }
			renderedCue.time = newTime;
			timeStyle(renderedCue.node);
			return true;
		};
	}());
	
	TimedText.registerType('text/vtt',{
		extension: 'vtt',
		name: 'WebVTT',
		cueType: WebVTTCue,
		isCueCompatible: function(cue){ return cue instanceof WebVTTCue; },
		positionCue: positionCue,
		updateCueTime: updateCueTime,
		//updateCueContent: updateCueContent, just use default
		parse: parse,
		serialize: function(track){
			return "WEBVTT\r\n\r\n"+[].map.call(track.cues,function(cue){ return serialize(cue); }).join('');
		}
	});
}());