/**
 * ROSPlot Manager
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 */

ROSManager = (function() {
    var COLORS = [ "#cc0000", "#4e9a06", "#c4a000", "#3465a4", 
                   "#75507b", "#06989a", "#d3d7cf", "#555753", 
                   "#ef2929", "#8ae234", "#fce94f", "#729fcf", 
                   "#ad7fa8", "#34e2e2", "#eeeeec" ];


    function ROSManager(bridgeport, mjpegport) {
        this.bridgeport = bridgeport || (~~location.port + 1)
        this.mjpegport = mjpegport || (this.bridgeport + 1)

        this.ros = new ROSLIB.Ros({
            url: 'ws://' + location.hostname + ':' + this.bridgeport
        });

        this.topics = []
        this.colors = COLORS
    }

    ROSManager.prototype.stringize = function(value) {
        return ((value>0 ? ' ' : '') + value).substring(0, 5);
    }

    ROSManager.prototype.time = function() {
        return new Date().getTime();
    }

    ROSManager.prototype.log = function(output) {
        console.log(output)
    }

    ROSManager.prototype.mjpeg = function(topic, width, height, quality, invert) {
        var url = 'http://' + location.hostname 
        url += ':' +this.mjpegport + '/stream';

        if (topic) url += '?topic=' + topic;
        if (width) url += '?width=' + width;
        if (height) url += '?height=' + height;
        if (quality) url += '?quality=' + quality;
        if (invert) url += '?invert=' + invert;
        return url;
    }

    ROSManager.prototype.subscribe = function(name, cb) {
        if (name.length < 1) return;
        if (name[0] != '/') name = '/' + name;

        var ref = { cb: cb };

        ref.name = name.match('[a-zA-Z0-9_/]*');
        if (ref.name)
            ref.name = ref.name[0];
        else
            ref.name = '';

        ref.field = name.substring(ref.name.length);
        ref.parse = Function('d', 'return d' + ref.field);


        var topic = this.topics[ref.name];

        if (topic) {
            topic.refs.push(ref);
            return ref;
        }

        topic = {
            topic: new ROSLIB.Topic({
                ros: this.ros,
                name: ref.name,
            }),

            refs: [ref],
        }

        this.log('subscribed: ' + ref.name);
        topic.topic.subscribe(function(data) {
            for (var i = 0; i < topic.refs.length; i++) {
                topic.refs[i].cb(topic.refs[i].parse(data));
            }
        });

        this.topics[ref.name] = topic;
        return ref;
    }

    ROSManager.prototype.subrange = function(name, cb, add, rm) {
        var self = this;

        var ref = this.subscribe(name, function(data) {
            if (data instanceof Array) {
                if (data[0] instanceof Array ||
                    data[0] instanceof Object) {

                    for (var i = 0; i < data.length; i++) {
                        add(ref.name + ref.field + '[' + i + ']');
                    }

                    rm();
                } else {
                    cb(data)
                    ref.cb = cb
                }
            } else if (data instanceof Object) {
                for (var key in data) {
                    add(ref.name + ref.field + '.' + key);
                }

                rm();

            } else {
                cb([data]);
                ref.cb = function() {
                    cb([data])
                }
            }
        });

        return ref;
    }

    ROSManager.prototype.subdata = function(name, cb, add, rm) {
        var self = this;

        var ref = this.subscribe(name, function(data) {
            if (data instanceof Array) {
                for (var i = 0; i < data.length; i++) {
                    add(ref.name + ref.field + '[' + i + ']');
                }

                rm();

            } else if (data instanceof Object) {
                for (var key in data) {
                    add(ref.name + ref.field + '.' + key);
                }

                rm();

            } else {
                cb(data);
                ref.cb = cb;
            }
        });

        return ref;
    }

    ROSManager.prototype.unsubscribe = function(ref) {
        var topic = this.topics[ref.name];

        var ind = topic.refs.indexOf(ref);
        topic.refs.splice(ind, 1);

        if (topic.refs.length == 0) {
            this.log('unsubscribed: ' + ref.name);
            topic.topic.unsubscribe();
            delete this.topics[ref.name];
        }
    }

    ROSManager.prototype.gettopics = function(cb) {
        this.ros.getTopics(cb);
    }

    return ROSManager;
})();

