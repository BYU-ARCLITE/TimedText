var TextTrackCue = (function(){
	var allowedDirs = {'':true,'rl':true,'lr':true},
		allowedAlign = {'start':true,'middle':true,'end':true,'left':true,'right':true},
		set_pat = /(align|vertical|line|size|position):(\S+)/g,
		time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*(.*)/,
		cueId = 0;
	
	//http://dev.w3.org/html5/webvtt/#webvtt-cue-text-dom-construction-rules
	function createTimestampNode(timeData){
		var node,
			hh = parseInt(timeData[1],10)|| 0,
			mm = parseInt(timeData[2],10) || 0,
			ss = parseInt(timeData[3],10) || 0,
			ms = parseFloat("0."+timeData[4]),
			seconds = hh*3600+mm*60+ss+ms, timestamp;
		ms *= 1000;
		timestamp = (hh>9?hh:"0"+hh)+":" +
					(mm>9?mm:"0"+mm)+":" +
					(ss>9?ss:"0"+ss)+"." +
					(ms>99?ms:(ms>9?"0"+ms:"00"+ms));
		try{
			node = document.createProcessingInstruction('timestamp',timestamp);
		}catch(e){
			node = document.createElement('i');
			node.dataset.target = "timestamp";
			node.dataset.timestamp = timestamp;
		}
		node.dataset.seconds = seconds;
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
			var tag, chunk, node;
				
			if (token[0] !== "<") { // Text string
				current.appendChild(document.createTextNode(token));
			}else if (token[1] === "/") { //Closing tag
				tag = token.match(/<\/([^\s>]+)/)[1].toUpperCase();
				if(tag === current.nodeName || tag === current.dataset.cuetag){
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
				}
				if(lang){ node.lang = lang; }
				current.appendChild(node);
				current = node;
			}
		});
		return DOM;
	}
		
	function validate_percentage(value){
		var number;
		if(/^\d+%$/.test(value)){
			number = parseInt(value,10);
			if(number>=0 && number<=100){
				return number;
			}
		}
		throw new IndexSizeError();
	}
	
	function parse_settings(cue,line){
		var fields;
		set_pat.lastIndex = 0;
		while(!!(fields = set_pat.exec(line))){
			cue[fields[1]] = fields[2];
		}
	}
	
	function TextTrackCue(startTime, endTime, text) {
		var wasActive = false,
			dir = '',
			line = "auto",
			position = 50,
			size = 100,
			align = "middle";
		this.track = null;
		this.id = "";
		this.startTime = parseFloat(startTime);
		this.endTime = parseFloat(endTime);
		this.pauseOnExit = false;
		this.snapToLines = true;
		this.DOM = null;
		
		Object.defineProperties(this,{
			text: {
				set: function(t){
					this.DOM = null;
					text = t;
				},
				get: function(){
					return text;
				},
				enumerable: true
			},
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
					this.snapToLines=true;
					if(typeof value === 'number'){ return (line = value)+""; }
					if(value==='auto'){ return line='auto'; }
					if(/^-?\d+%?$/.test(value)){
						number = parseInt(value,10);
						if(value[value.length-1] === '%'){	//If the last character in value is %
							if(number<0 || number>100){ throw new IndexSizeError(); }
							this.snapToLines = false;
						}
						line = number;
						return value;
					}
					throw new SyntaxError("Invalid Line Position");
				},get: function(){return this.snapToLines?line:(line+"%");},
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
			},
			active: {
				get: function() {
					var currentTime,
						track = this.track;
					if (	!(track instanceof TextTrack)	||
							track.readyState !== TextTrack.LOADED ||
							track.mode === "disabled"
						){ return false; }
					
					currentTime = track.currentTime;
					if (this.startTime <= currentTime && this.endTime >= currentTime) {
						if (!wasActive) {
							// Fire enter event if we were not active and now are
							wasActive = true;
							this.onenter();
						}
					}else if (wasActive) {
						// Fire exit event if we were active and now are not
						wasActive = false;
						this.onexit();
					}

					return wasActive;
				}
			}
		});
	};
	TextTrackCue.prototype.toString = function toString() {
		return "TextTrackCue:" + this.id + "\n" + String(this.text);
	};
	// Events defined by spec
	TextTrackCue.prototype.onenter = function() {};
	TextTrackCue.prototype.onexit = function() {};
	//Methods defined by spec
	TextTrackCue.prototype.getCueAsHTML = function(sanitize) {
		if(!this.DOM){
			this.DOM = processCaptionHTML(this.text,sanitize !== false);
		}
		return this.DOM.cloneNode(true);
	};
	
	return TextTrackCue;
}());