var TextTrackCue = (function(){
	var allowedDirs = {'':true,'rl':true,'lr':true},
		allowedAlign = {'start':true,'middle':true,'end':true,'left':true,'right':true},
		set_pat = /(align|vertical|line|size|position):(\S+)/g,
		time_pat = /\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*-->\s*(\d*:?[0-5]\d:[0-5]\d\.\d{3})\s*(.*)/,
		cueId = 0;
		
	function processLayer(layerObject,undefined) {
		var fragment = document.createDocumentFragment();
		layerObject.map(function(cueChunk){
			var node, n2;
			// Don't generate text from the token if it has no contents
			if (cueChunk.children && cueChunk.children.length) {
				if (cueChunk.token === 'v') {
					node = document.createElement('q');
					node.className = "voice";
					node.dataset.voice = cueChunk.voice;
				} else {
					node = document.createElement('span');
					if(cueChunk.token === "c"){
						node.className = cueChunk.classes;
					} else if(cueChunk.timeIn > 0) {
						node.dataset.timestamp = cueChunk.timeIn;
					} else {
						node.innerHTML = cueChunk.rawToken + '</' + cueChunk.token + '>';
						node = node.firstChild;
					}
				}
				node.appendChild(processLayer(cueChunk.children));
			} else {
				node = document.createTextNode(cueChunk);
			}
			return node;
		}).forEach(function(node){ fragment.appendChild(node); });			
		return fragment;
	}
		
	function hasRealTextContent(textInput) {
		return !!textInput.replace(/[^a-z0-9]+/ig,"").length;
	}
	
	function processCaptionHTML(inputHTML,sanitize) {
		var cueStructure = [],
			currentContext = cueStructure,
			stack = [];
		
		// Process out special cue spans
		inputHTML
			.split(/(<\/?[^>]+>)/ig)
			.filter(function(cuePortionText) {
				return !!cuePortionText.replace(/\s*/ig,"");
			}).forEach(function(currentToken,splitIndex) {
			var TagName, tmpObject,
				stackIndex, stackScanDepth, parentContext,
				chunkTimestamp, timeData;
				
			if (currentToken[0] === "<") {
				if (currentToken[1] === "/") {
					// Closing tag
					TagName = currentToken.match(/<\/([^\s>]+)/)[1];
					if (stack.length > 0) {
						// Scan backwards through the stack to determine whether we've got an open tag somewhere to close.
						stackScanDepth = 0;
						for (stackIndex = stack.length-1; stackIndex >= 0; stackIndex --) {
							parentContext = stack[stackIndex][stack[stackIndex].length-1];
							stackScanDepth = stackIndex;
							if (parentContext.token === TagName) { break; }
						}
					
						currentContext = stack[stackScanDepth];
						stack = stack.slice(0,stackScanDepth);
					} else {
						// Tag mismatch!
					}
				} else {
					// Opening Tag
					// Check whether the tag is valid according to the WebVTT specification
					// If not, don't allow it (unless the sanitiseCueHTML option is explicitly set to false)
				
					if (sanitize
							|| currentToken.match(/^<(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)/)
							|| currentToken.match(/^<v\s+[^>]+>/i)
							|| currentToken.match(/^<c[a-z0-9\-\_\.]+>/)
							|| currentToken.match(/^<(b|i|u|ruby|rt)>/)
						) {
						tmpObject = (function(obj){
							if (currentToken[1] === "v") {
								obj.voice = currentToken.match(/^<v\s*([^>]+)>/i)[1].replace(/[\"]/g,"");
							} else if (currentToken[1] === "c") {
								obj.classes = currentToken
												.replace(/[<\/>\s]+/ig,"")
												.split(/[\.]+/ig)
												.slice(1)
												.filter(hasRealTextContent).join(' ');
							} else if (!!(chunkTimestamp = currentToken.match(/(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)/))) {
								timeData = chunkTimestamp.slice(1);
								obj.timeIn =	parseInt((timeData[0]||0) * 60 * 60,10) +	// Hours
												parseInt((timeData[1]||0) * 60,10) +		// Minutes
												parseInt((timeData[2]||0),10) +				// Seconds
												parseFloat("0." + (timeData[3]||0));		// MS
							}
							return obj;
						}({token: currentToken.replace(/[<\/>]+/ig,"").split(/[\s\.]+/)[0], rawToken: currentToken, children: []}));
						
						currentContext.push(tmpObject);
						stack.push(currentContext);
						currentContext = tmpObject.children;
					}
				}
			} else {
				// Text string
				currentContext.push(sanitize?currentToken.replace(/</g,"&lt;")
									.replace(/>/g,"&gt;")
									.replace(/\&/g,"&amp;"):currentToken);
			}
		});

		return processLayer(cueStructure);
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
							!(track.mode === "showing" || track.mode === "hidden")
						){ return false; }
					
					currentTime = track.currentTime;
					if (this.startTime <= currentTime && this.endTime >= currentTime) {
						if (!wasActive) {
							// Fire enter event if we were not active and now are
							wasActive = true;
							this.onenter();
						}
						return true;
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