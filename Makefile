# Makefile for roswebkit
TARGET = roswebkit

# Input Files 
SRC += rosman.js
SRC += rosecho.js
SRC += rosplot.js
SRC += rosplot2.js
SRC += rosrange.js
SRC += rosrrange.js
SRC += roswatch.js
SRC += rosauto.js

# Online Dependencies
DEP += http://cdn.robotwebtools.org/EventEmitter2/current/eventemitter2.min.js
DEP += http://cdn.robotwebtools.org/roslibjs/current/roslib.min.js

# Flag Definitions
MFLAGS += --level=1
MFLAGS += --minify

# Rules
all: $(TARGET).min.js

run: $(TARGET).js
	python -m SimpleHTTPServer

$(TARGET).js: $(SRC)
	cat $^ > $@
	wget $(DEP) -O - >> $@

%.min.js: %.js
	minifyjs $(MFLAGS) -i $< -o $@
