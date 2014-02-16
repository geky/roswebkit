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
SRC += rosmap.js
SRC += rosauto.js
SRC := $(addprefix src/, $(SRC))

# Online Dependencies
DEP += http://cdn.robotwebtools.org/EventEmitter2/current/eventemitter2.min.js
DEP += http://cdn.robotwebtools.org/roslibjs/current/roslib.min.js

# Flag Definitions
MFLAGS += --level=1
MFLAGS += --minify


# Rules
all: $(TARGET).js $(TARGET).min.js

run: $(TARGET).min.js
	python -m SimpleHTTPServer 7000

clean:
	-rm roswebkit*js

$(TARGET).js: $(SRC)
	cat $^ > $@
	wget $(DEP) -O - >> $@

%.min.js: %.js
	minifyjs $(MFLAGS) -i $< -o $@
