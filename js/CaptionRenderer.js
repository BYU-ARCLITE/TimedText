(function(TimedText){
	"use strict";

	if(!TimedText){ throw new Error("TimedText not defined."); }

	/* getDisplayMetrics(DOMNode)
		An object with the following properties:
			left: The calculated left offset of the display
			top: The calculated top offset of the display
			height: The calculated height of the display
			width: The calculated width of the display
	*/
	function getDisplayMetrics(renderer){
		var UA, offsetObject = renderer.target,
			nodeComputedStyle = window.getComputedStyle(offsetObject,null),
			offsetTop = 0, offsetLeft = 0, controlHeight = 0;

		if(typeof renderer.controlHeight === 'number'){
			controlHeight = renderer.controlHeight;
		}else if(offsetObject.hasAttribute("controls")){
			// Get heights of default control strip in various browsers
			// There could be a way to measure this live but I haven't thought/heard of it yet...
			UA = navigator.userAgent.toLowerCase();
			controlHeight =	~UA.indexOf("chrome")?35:
							~UA.indexOf("opera")?25:
							~UA.indexOf("firefox")?28:
							~UA.indexOf("ie 9")?44:
							~UA.indexOf("ipad")?44:
							~UA.indexOf("safari")?25:
							0;
		}

		while(offsetObject && offsetObject !== renderer.appendCueCanvasTo){
			offsetTop += offsetObject.offsetTop;
			offsetLeft += offsetObject.offsetLeft;
			offsetObject = offsetObject.offsetParent;
		}

		return {
			left: offsetLeft,
			top: offsetTop,
			width: parseInt(nodeComputedStyle.getPropertyValue("width"),10),
			height: parseInt(nodeComputedStyle.getPropertyValue("height"),10)-controlHeight
		};
	}

	function defaultRenderCue(renderedCue,area){
		var node, kind = renderedCue.kind;
		if(renderedCue.dirty){ renderedCue.cleanup(); }
		if(kind === "chapters" || kind === "metadata"){ return; }
		node = document.createElement('div');
		node.appendChild(renderedCue.cue.getCueAsHTML());
		renderedCue.node = node;
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

	/* styleCueContainer(renderer)
		Styles and positions a div for displaying cues on a video.
	*/
	function styleCueContainer(renderer,videoMetrics){
		var baseFontSize = Math.max(((videoMetrics.height * renderer.fontSizeRatio)/96)*72,renderer.minFontSize),
			baseLineHeight = Math.max(Math.floor(baseFontSize * renderer.lineHeightRatio),renderer.minLineHeight),
			styles = {
				"height": videoMetrics.height + "px",
				"width": videoMetrics.width + "px",
				"top": videoMetrics.top + "px",
				"left": videoMetrics.left + "px",
				"fontSize": baseFontSize + "pt",
				"lineHeight": baseLineHeight + "pt"
			};

		applyStyles(renderer.container,styles);
		if(renderer.showDescriptions){
			applyStyles(renderer.descriptor,styles);
		}
	}

	function defaultPosCue(rendered, availableCueArea, videoMetrics){
		var DOMNode = rendered.node,
			cueObject = rendered.cue,
			cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0;

		cueWidth = availableCueArea.width;
		cueX = ((availableCueArea.right - cueWidth)/2) + availableCueArea.left;

		applyStyles(DOMNode,{
			display: "inline-block",
			position: "absolute",
			unicodeBidi: "plaintext",
			overflow: "hidden",
			height: "1px", //so the scrollheight has a baseline to work from
			width: cueWidth + "px",
			left: cueX + "px",
			padding: "0px " + Math.floor(videoMetrics.width/100) + "px",
			textAlign: "center",
			direction: TimedText.getTextDirection(DOMNode.textContent),
			lineHeight: "normal", //override anything that might otherwise be inherited
			boxSizing: "border-box"
		});

		cueHeight = DOMNode.scrollHeight;
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
		} else if(availableCueArea.top < cueY + cueHeight){
			availableCueArea.top = cueY + cueHeight;
		}
		availableCueArea.height = availableCueArea.bottom - availableCueArea.top;
	}

	function defaultContentCheck(rendered){
		var prop, dirty = false,
			cue = rendered.cue,
			properties = rendered.properties;

		for(prop in cue){
			if(!cue.hasOwnProperty(prop)){ continue; }
			if(properties[prop] !== cue[prop]){
				properties[prop] = cue[prop];
				dirty = true;
			}
		}
		return dirty;
	}

	function defaultKaraokeCheck(rendered, time){
		return false;
	}

	/*	RenderedCue(renderer, cue, track)
		Auxilliary object for keeping track of a cue that is currently active with a rendered representation.
		Provides the interface for interacting with custom render functions.
	*/
	function RenderedCue(renderer, cue, track){
		var type,
			posFn = defaultPosCue,
			timeFn = defaultKaraokeCheck,
			contFn = defaultContentCheck,
			editable = TimedText.isCueEditable(cue),
			node = null, gclist = [];

		this.done = false;
		this.dirty = true;
		this.time = "";
		this.properties = {};
		this.autoPosition = track.kind !== "descriptions" && track.kind !== "metadata";

		Object.defineProperties(this,{
			cue: { get: function(){ return cue; }, enumerable: true },
			typeInfo: { get: function(){ return type; }, enumerable: true},
			editable: { get: function(){ return editable; }, enumerable: true },
			renderer: { get: function(){ return renderer; }, enumerable: true },
			kind: { get: function(){ return track.kind; }, enumerable: true },
			mode: { get: function(){ return track.mode; }, enumerable: true },
			language: { get: function(){ return track.language; }, enumerable: true },
			trackLabel: { get: function(){ return track.label; }, enumerable: true },
			node: {
				set: function(nnode){
					if(node && node !== nnode && node.parentNode){
						node.parentNode.removeChild(node);
					}
					node = nnode instanceof HTMLElement?nnode:null;
					node.classList.add("caption-cue");
					return node;
				},
				get: function(){ return node; },
				enumerable: true
			},
			visible: {
				get: function(){
					if(!this.node){ return false; }
					switch(this.node.parentNode){
					case renderer.container: return true;
					case renderer.descriptor: return renderer.showDescriptions;
					default: return false;
					}
				},
				enumerable: true
			}
		});

		type = TimedText.getCueTypeInfo(cue);
		if(type){
			posFn = type.positionCue || defaultPosCue;
			timeFn = type.updateCueTime || defaultKaraokeCheck;
			contFn = type.updateCueContent || defaultContentCheck;
		}

		this.positionCue = function(availableCueArea, videoMetrics){
			if(!this.autoPosition || !this.visible){ return; }
			posFn(this, availableCueArea, videoMetrics);
		};

		this.updateTime = function(time){
			if(!(this.node instanceof HTMLElement)){ return false; }
			return timeFn(this,time);
		};

		this.updateContent = function(){
			this.dirty = contFn(this);
			return this.dirty;
		};

		this.addFinalizer = function(fn){
			if(typeof fn !== 'function'){ return; }
			gclist.push(fn);
		};

		this.removeFinalizer = function(fn){
			var idx = gclist.indexOf(fn);
			if(~idx){ gclist.splice(idx,1); }
		};

		this.cleanup = function(){
			var that = this;
			gclist.forEach(function(fn){ fn.call(that); });
			if(this.node && this.node.parentNode){
				this.node.parentNode.removeChild(this.node);
			}
		};

		contFn(this);
	}

	/* CaptionRenderer([options - JS Object])
	*/
	function CaptionRenderer(options){
		if(!(this instanceof CaptionRenderer)){ return new CaptionRenderer(options); }
		options = options instanceof Object? options : {};
		var media, renderer = this, internalTime = 0,
			timeupdate = function(){ renderer.currentTime = (media?media.currentTime:0) || 0; },
			container = document.createElement("div"),
			descriptor = document.createElement("div"),
			descriptorId = "description-display-"+(Math.random()*9999).toString(16),
			appendCueCanvasTo = (options.appendCueCanvasTo instanceof HTMLElement)?options.appendCueCanvasTo:document.body,
			renderCue = typeof options.renderCue === 'function'?options.renderCue:defaultRenderCue,
			target = options.target instanceof HTMLElement ? options.target : null,
			showDescriptions = !!options.showDescriptions;

		container.className = "caption-cue-canvas";
		container.setAttribute("aria-live","off");

		descriptor.id = descriptorId;
		descriptor.className = "caption-desc-area";
		descriptor.setAttribute("aria-live","assertive");

		appendCueCanvasTo.appendChild(container);
		appendCueCanvasTo.appendChild(descriptor);

		if(target){
			target.setAttribute("aria-describedby",target.hasAttribute("aria-describedby") ? target.getAttribute("aria-describedby") + " " + descriptorId : descriptorId);
			target.classList.add("captioned");
		}

		this.container = container;
		this.descriptor = descriptor;
		this.tracks = [];
		this.renderedCues = [];

		window.addEventListener("resize", this.refreshLayout.bind(this) ,false);
		this.bindMediaElement = function(element){
			if(media && typeof media.removeEventListener === 'function'){ media.removeEventListener('timeupdate',timeupdate,false); }
			media = element;
			if(media){
				if(typeof media.addEventListener === 'function'){ media.addEventListener('timeupdate',timeupdate,false); }
				this.currentTime = media.currentTime || 0;
			}
		};

		Object.defineProperties(this,{
			target: {
				get: function(){ return target; },
				set: function(el){
					var i, descstr, wasoff = !target;
					if(!(el instanceof HTMLElement || el !== null) || target === el){ return target; }
					if(target){
						target.classList.remove("captioned");
						descstr = target.getAttribute("aria-describedby");
						if(descstr === descriptorId){
							target.removeAttribute("aria-describedby");
						}else{
							i = descstr.indexOf(descriptorId);
							if(i === 0){ target.setAttribute("aria-describedby", descstr.substring(descriptorId.length)); }
							else if(i !== -1){ target.setAttribute("aria-describedby", descstr.substring(0, i-1)+descstr.substring(i+descriptorId.length)); }
						}
					}
					target = el;
					if(el){
						el.setAttribute("aria-describedby",el.hasAttribute("aria-describedby") ? el.getAttribute("aria-describedby") + " " + descriptorId : descriptorId);
						el.classList.add("captioned");
						if(wasoff){ this.rebuildCaptions(); }
						else{ this.refreshLayout(); }
					}else{
						container.style.opacity = 0;
						descriptor.style.opacity = 0;
					}
					return target;
				}
			},
			currentTime: {
				get: function(){ return internalTime; },
				set: function(time){
					internalTime = +time || 0;
					// update active cues
					try{ this.tracks.forEach(function(track){ track.currentTime = internalTime; }); }
					catch(ignore){}
					this.rebuildCaptions(false);
				},
				enumerable: true
			},
			appendCueCanvasTo: {
				get: function(){ return appendCueCanvasTo; },
				set: function(val){
					if(!(val instanceof HTMLElement)){ val = document.body; }
					if(appendCueCanvasTo === val){ return val; }
					appendCueCanvasTo = val;
					appendCueCanvasTo.appendChild(container);
					appendCueCanvasTo.appendChild(descriptor);
					this.refreshLayout();
					return appendCueCanvasTo;
				},
				enumerable: true
			},
			renderCue: {
				get: function(){ return renderCue; },
				set: function(val){
					renderCue = typeof val === 'function'?val:defaultRenderCue;
					this.refreshLayout();
					return renderCue;
				},
				enumerable: true
			},
			showDescriptions: {
				get: function(){ return showDescriptions; },
				set: function(val){
					val = !!val;
					if(showDescriptions !== val){
						showDescriptions = val;
						this.refreshLayout();
					}
					return showDescriptions;
				},
				enumerable: true
			}
		});
	}

	CaptionRenderer.prototype.addTextTrack = function(kind,label,language){
		var newTrack;
		if(kind instanceof TextTrack){
			newTrack = kind;
		}else{
			newTrack = new TextTrack(
			typeof kind === "string" ? kind : "",
			typeof label === "string" ? label : "",
			typeof language === "string" ? language : "");
			newTrack.readyState = TextTrack.LOADED;
		}
		if(newTrack && this.tracks.indexOf(newTrack) === -1){
			this.tracks.push(newTrack);
			newTrack.renderer = this;
			return newTrack;
		}
		return null;
	};

	CaptionRenderer.prototype.removeTextTrack = function(track){
		var i = this.tracks.indexOf(track);
		if(i !== -1){ return this.tracks.splice(i,1)[0]; }
		return null;
	};

	function collectCues(tracks, fn){
		var activeCues = [];
		tracks.forEach(function(track){
			if(track.mode === "disabled" || track.readyState !== TextTrack.LOADED){ return; }
			[].push.apply(activeCues,[].map.call(track.activeCues,fn.bind(null,track)));
		});
		return activeCues;
	}

	CaptionRenderer.prototype.rebuildCaptions = function(force){
		var renderer = this,
			container = this.container,
			descriptor = this.descriptor,
			currentTime = this.currentTime,
			renderedCues = this.renderedCues,
			renderCue = this.renderCue,
			posBit = false, dirtyBit = force,
			area, activeCues, videoMetrics;

		if(force){
			//force re-render no matter what
			renderedCues.forEach(function(rendered){
				var node = rendered.node;
				if(node && node.parentNode){ node.parentNode.removeChild(node); }
			});
			activeCues = collectCues(this.tracks, function(track, cue){
				return new RenderedCue(renderer,cue,track);
			});
		}else{
			//find out if any cues are different
			activeCues = collectCues(this.tracks, function(track, cue){
				var i, cached;
				for(i=0;cached = renderer.renderedCues[i];i++){
					if(cached.cue === cue){
						dirtyBit = dirtyBit || cached.updateContent();
						if(!dirtyBit){
							posBit = posBit || cached.updateTime(currentTime);
						}
						return cached;
					}
				}
				dirtyBit = true;
				return new RenderedCue(renderer,cue,track);
			});

			renderedCues.forEach(function(old){
				//check for lapse to inactive status
				if(activeCues.some(function(rendered){ return rendered.cue === old.cue; })){ return; }
				posBit = true;

				old.cleanup();
				if(old.cue.pauseOnExit && this.media && typeof this.media.pause === 'function'){
					this.media.pause();
				}
			});
		}

		if(!this.target){ return; }

		// If needed, redraw
		if(dirtyBit){
			container.style.opacity = 0;
			descriptor.style.opacity = 0;

			videoMetrics = getDisplayMetrics(this);
			styleCueContainer(this,videoMetrics);

			// Define storage for the available cue area, diminished as further cues are added
			// Cues occupy the largest possible area they can, either by width or height
			// (depending on whether the 'direction' of the cue is vertical or horizontal)
			// Cues which have an explicit position set do not detract from this area.
			area = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};

			activeCues.forEach(function(rendered){
				var node, kind = rendered.kind;

				if(!rendered.dirty){ return; }
				renderCue(rendered,area,
					function(){ defaultRenderCue(rendered,area); });
				rendered.done = true;
				rendered.dirty = false;
				node = rendered.node;

				if(node === null){ return; }

				if(!node.hasAttribute('lang')){
					node.setAttribute('lang',rendered.language);
				}

				if(rendered.mode !== "showing" || node === null){ return; }

				rendered.updateTime(currentTime);

				if(node.parentNode === null){
					if(kind === 'descriptions'){
						descriptor.appendChild(node);
					}else if(kind !== "chapters" && kind !== "metadata"){
						container.appendChild(node);
					}else{ return; }
				}

				rendered.positionCue(area,videoMetrics);
			});
		}else if(posBit){
			//just reposition things, in case the karaoke styling altered metrics or something disappeared
			container.style.opacity = 0;
			descriptor.style.opacity = 0;

			videoMetrics = getDisplayMetrics(this);
			styleCueContainer(this,videoMetrics);

			area = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};
			renderedCues.forEach(function(rendered){
				rendered.positionCue(area,videoMetrics);
			});
		}

		this.renderedCues = activeCues;
		container.style.opacity = 1;
		if(this.showDescriptions){
			descriptor.style.opacity = 1;
		}
	};

	CaptionRenderer.prototype.refreshLayout = function(){
		if(!this.target){ return; }
		var renderer = this, area,
			container = this.container,
			descriptor = this.descriptor,
			currentTime = this.currentTime,
			videoMetrics = getDisplayMetrics(renderer),
			area = {
				"top": 0, "left": 0,
				"bottom": videoMetrics.height,
				"right": videoMetrics.width,
				"height": videoMetrics.height,
				"width": videoMetrics.width
			};

		// Get the canvas ready
		container.style.opacity = 0;
		descriptor.style.opacity = 0;
		styleCueContainer(this,videoMetrics);

		this.renderedCues.forEach(function(rendered){
			rendered.updateTime(currentTime);
			rendered.updateContent();
			rendered.positionCue(area,videoMetrics);
		});
		container.style.opacity = 1;
		if(this.showDescriptions){
			descriptor.style.opacity = 1;
		}
	};

	/* processVideoElement(videoElement <HTMLVideoElement>,
						[options - JS Object])
	*/
	CaptionRenderer.prototype.processVideoElement = function(videoElement,options){
		options = options instanceof Object? options : {};
		var renderer = this,
			trackList = this.tracks,
			language = navigator.language || navigator.userLanguage,
			defaultLanguage = options.language || language.split("-")[0],
			elements = [].slice.call(videoElement.querySelectorAll("track"),0);

		if(elements.length === 0){ return; }

		elements.forEach(function(trackElement){
			var trackEnabled = false,
				sources = trackElement.querySelectorAll("source"),
				trackObject = new TextTrack(
							trackElement.getAttribute("kind"),
							trackElement.getAttribute("label"),
							trackElement.getAttribute("srclang").split("-")[0]);

			trackObject.loadTrack(sources.length > 0?sources:trackElement.getAttribute("src"));

			// Now determine whether the track is visible by default.
			// The comments in this section come straight from the spec...
			trackObject.internalDefault = trackElement.hasAttribute("default");
			switch(trackObject.kind){
				// If the text track kind is subtitles or captions and the user has indicated an interest in having a track
				// with this text track kind, text track language, and text track label enabled, and there is no other text track
				// in the media element's list of text tracks with a text track kind of either subtitles or captions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "subtitles":
				case "captions": if(options.enableCaptionsByDefault && defaultLanguage === trackObject.language){
					trackEnabled = !trackList.some(function(track){
						return	(track.kind === "captions" || track.kind === "subtitles") &&
								defaultLanguage === trackObject.language &&
								trackObject.mode === "showing";
					});
				}break;
				// If the text track kind is chapters and the text track language is one that the user agent has reason to believe is
				// appropriate for the user, and there is no other text track in the media element's list of text tracks with a text track
				// kind of chapters whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "chapters": if(defaultLanguage === trackObject.language){
					trackEnabled = !trackList.filter(function(track){
						return track.kind === "chapters" && track.mode === "showing";
					});
				}break;
				// If the text track kind is descriptions and the user has indicated an interest in having text descriptions
				// with this text track language and text track label enabled, and there is no other text track in the media element's
				// list of text tracks with a text track kind of descriptions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "descriptions": if(options.enableDescriptionsByDefault && defaultLanguage === trackObject.language){
					trackEnabled = !trackList.filter(function(track){
						return track.kind === "descriptions" && track.mode === "showing";
					});
				}
			}

			// If there is a text track in the media element's list of text tracks whose text track mode is showing by default,
			// the user agent must furthermore change that text track's text track mode to hidden.
			trackEnabled && trackList.forEach(function(track){
				if(track.internalDefault && trackObject.mode === "showing"){
					trackObject.mode = "hidden";
				}
			});

			// If the track element has a default attribute specified, and there is no other text track in the media element's
			// list of text tracks whose text track mode is showing or showing by default
			// Let the text track mode be showing by default.
			trackEnabled |= trackObject.internalDefault && !trackList.some(function(track){
				return track.mode === "showing";
			});

			// Otherwise
			// Let the text track mode be disabled.
			trackObject.mode = trackEnabled?"showing":"disabled";
			trackObject.renderer = renderer;
			trackList.push(trackObject);
		});

		this.rebuildCaptions(false);
	};

	TimedText.CaptionRenderer = CaptionRenderer;
}(window.TimedText));