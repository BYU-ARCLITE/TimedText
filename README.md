TimedText
=========

Parsers and serializers for caption/subtitle formats.

# Cue.js
A pure JavaScript implementation of WebVTT Cue objects. Used as the standard target for parsers and source for serializers.

# WebVTT.js
A parser/serializer for the WebVTT format.

# SRT.js
A parser/serializer for the SRT format.

# Interface
Each parser/serializer is an object with two methods: ''parse'' and ''serialize''.
    * Parse takes in a file and returns an array of Cue objects.
	* Serialize takes in a Cue object and returns a string of the serialization for that cue. Composing multiple cues into a valid file with headers and so forth is the client's job.
	