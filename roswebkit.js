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

/**
 * ROSEcho raw topic data
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * echo raw topic data
 *
 */

var ROSEcho = (function() {
    function ROSEcho(ros, topics) {
        var self = this
        this.ros = ros

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        this.topic = topics[0]

        this.ref = this.ros.subscribe(this.topic, function(data) {
            self.message = data
        })
    }

    ROSEcho.prototype.render = function(ctx) {
      ctx.fillStyle = '#f0f0f0'
      ctx.font = '12px monospace';

      var y = 0;

      var echo = function(x, name, data) {
        if (data instanceof Array) {
          ctx.fillText(name + ': [' + data.join(', ') + ']', x, y += 12);
         
        } else if (data instanceof Object && !(data instanceof Array)) {
          ctx.fillText(name + ':', x, y += 12);

          for (var k in data) {
            echo(x + 12, k, data[k]);
          }
        } else {
          ctx.fillText(name + ': ' + data, x, y += 12);
        }
      }

      echo(0, this.topic, this.message);
    }

    ROSEcho.prototype.destroy = function() {
        this.ros.unsubscribe(this.ref)
    }

    return ROSEcho
})();

/**
 * ROSPlot plotter
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * plots fields against time
 *
 * params:
 *  lines: display lines or points
 *  zero: display zero line
 *  miny: minimum y value
 *  maxy: maximum y value
 *  buffer: size of buffer in seconds
 */

var ROSPlot = (function() {
    function ROSPlot(ros, topics) {
        this.ros = ros
        this.topics = []

        this.lines = true
        this.zero = true
        this.miny = null
        this.maxy = null
        this.buffer = 5

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        for (var i = 0; i < topics.length; i++) {
            this.addplot(topics[i])
        }
    }

    ROSPlot.prototype.addplot = function(name) {
        var self = this
        var ros = this.ros

        var topic = {
            name: name,
            times: [],
            values: [],
            color: ros.colors[this.topics.length % ros.colors.length],
        }

        topic.ref = ros.subdata(name, function(data) {
            topic.times.push(ros.time())
            topic.values.push(data)
        }, function(newname) {
            console.log(newname)
            self.addplot(newname)
        }, function() {
            self.topics.splice(topics.indexOf(topic), 1)
            ros.unsubscribe(topic.ref)
        })

        this.topics.push(topic)

        if (this.topics.length == 1)
            this.title = name
    }

    ROSPlot.prototype.render = function(ctx) {
        var topics = this.topics
        var ros = this.ros

        var min_y = 1
        var max_y = ctx.height - 1
        var min_x = 1
        var max_x = ctx.width - 33

        var max_value = -Infinity
        var min_value = +Infinity
        var max_time = ros.time()
        var min_time = max_time - (this.buffer*1000)

        var x, y;

        for (var i = 0; i < topics.length; i++) {
            var topic = topics[i]

            while (topic.times.length > 0 && 
                   topic.times[0] < min_time-1000) {
                topic.times.shift()
                topic.values.shift()
            }

            while (topic.times.length > 1 && 
                   topic.times[0] == topic.times[1]) {
                topic.times.shift()
                topic.values.shift()
            } 

            for (var ii = 0; ii < topic.values.length; ii++) {
                if (topic.values[ii] > max_value)
                    max_value = topic.values[ii]

                if (topic.values[ii] < min_value)
                    min_value = topic.values[ii]
            }
        }

        if (this.maxy != null)
            max_value = this.maxy

        if (this.miny != null)
            min_value = this.miny

        if (min_value == max_value) {
            max_value += 0.00001
            min_value -= 0.00001
        }

        ctx.lineWidth = 2
        ctx.strokeStyle = '#555'
        ctx.beginPath()
        ctx.moveTo(max_x, min_y-3)
        ctx.lineTo(max_x, max_y+3)
        ctx.moveTo(min_x-3, max_y)
        ctx.lineTo(max_x+3, max_y)

        y = ~~((max_y-min_y)/2 + min_y)
        ctx.moveTo(max_x-3, min_y)
        ctx.lineTo(max_x+3, min_y)
        ctx.moveTo(max_x-3, y)
        ctx.lineTo(max_x+3, y)

        for (var i = 0; i < this.buffer; i++) {
            x = ~~((max_x-min_x) * (i/this.buffer) + min_x)
            ctx.moveTo(x, max_y-3)
            ctx.lineTo(x, max_y+3)
        }

        if (this.zero && max_value > 0 && min_value < 0) {
            var yy = (-min_value) / (max_value-min_value)
            yy = ((1-yy)*(max_y - min_y)) + min_y
            ctx.moveTo(max_x+3, ~~yy)
            ctx.lineTo(min_x, ~~yy)
        }

        ctx.stroke();

        var value = (max_value-min_value)/2 + min_value
        ctx.fillStyle = '#f0f0f0'
        ctx.font = '9px monospace'
        ctx.fillText(ros.stringize(min_value), max_x+6, max_y)
        ctx.fillText(ros.stringize(    value), max_x+6, y+3)
        ctx.fillText(ros.stringize(max_value), max_x+6, min_y+6)

        for (var i = 0; i < topics.length; i++) {
            ctx.strokeStyle = topics[i].color
            ctx.fillStyle = topics[i].color
            ctx.beginPath();

            var prev_time = min_time;

            for (var ii = 0; ii < topics[i].values.length; ii++) {
                var v = topics[i].values[ii]
                var t = topics[i].times[ii]

                var count = 0

                for (var iii = ii; iii < topics[i].values.length; iii++) { 
                    if (topics[i].times[iii] == t)
                        count++
                    else
                        break
                }

                t -= (t-prev_time) * (count-1) / count;
                prev_time = t;

                v = (v-min_value) / (max_value-min_value);
                t = (t-min_time) / (max_time-min_time);

                x = (t*(max_x - min_x))+min_x;
                y = ((1-v)*(max_y - min_y))+min_y;

                if (this.lines) {
                    if (ii == 0)
                        ctx.moveTo(x, y)
                    else
                        ctx.lineTo(x, y)
                } else {
                    ctx.fillRect(~~x, ~~y, 2, 2)
                }
            }

            ctx.stroke()

            ctx.font = '12px monospace'
            ctx.fillText(topics[i].name, min_x, (i+1)*12 + min_y)
        }
    }

    ROSPlot.prototype.destroy = function() {
        for (var i = 0; i < this.topics.length; i++) {
            this.ros.unsubscribe(this.topics[i].ref)
        }
    }

    return ROSPlot
})();

/**
 * ROSPlot2 two axis plotter
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * plots one field against another
 *
 * params:
 *  lines: display lines or points
 *  zero: display zero lines
 *  miny: minimum y value
 *  maxy: maximum y value
 *  minx: minimum x value
 *  maxx: maximum x value
 *  buffer: size of buffer in seconds
 */

var ROSPlot2 = (function() {
    function ROSPlot2(ros, topics) {
        this.ros = ros
        this.topics = []

        this.lines = true
        this.zero = true
        this.miny = null
        this.maxy = null
        this.minx = null
        this.maxx = null
        this.buffer = 5

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        for (var i = 0; i < topics.length; i+=2) {
            this.addplot(topics.slice(i, i+2))
        }
    }

    ROSPlot2.prototype.addplot = function(names) {
        var self = this
        var ros = this.ros

        if (!(names instanceof Array))
            names = names.split(/\s*,\s*/)

        var topic = {
            xname: names[0],
            yname: names[1],
            times: [],
            xs: [],
            ys: [],
            color: ros.colors[this.topics.length % ros.colors.length],
        }

        var sub = function(name, times, mine, other) {
            return ros.subscribe(name, function(data) {
                if (mine.length < other.length) {
                    times[mine.length-1] = ros.time();
                    mine.push(data);
                } else if (mine.length > other.length) {
                    times[mine.length-1] = ros.time();
                    mine[mine.length-1] = data;
                } else {
                    times.push(ros.time());
                    mine.push(data);
                }
            });
        }

        topic.xref = sub(topic.xname, topic.times, topic.xs, topic.ys);
        topic.yref = sub(topic.yname, topic.times, topic.ys, topic.xs);
        this.topics.push(topic)

        if (this.topics.length == 1)
            this.title = name
    }

    ROSPlot2.prototype.render = function(ctx) {
        var topics = this.topics
        var ros = this.ros

        var min_y = 1;
        var max_y = ctx.height - 10;
        var min_x = 33;
        var max_x = ctx.width - 1;

        var max_vx = -Infinity;
        var min_vx = +Infinity;
        var max_vy = -Infinity;
        var min_vy = +Infinity;

        var min_time = ros.time() - (this.buffer)*1000;

        var x, y;

        for (var i = 0; i < topics.length; i++) {
            var topic = topics[i];

            while (topic.times.length > 0 && 
                   topic.times[0] < min_time-1000) {
                topic.times.shift();
                topic.xs.shift();
                topic.ys.shift();
            }

            for (var ii = 0; ii < topic.times.length; ii++) {
                if (topic.xs[ii] > max_vx)
                    max_vx = topic.xs[ii];

                if (topic.xs[ii] < min_vx)
                    min_vx = topic.xs[ii];

                if (topic.ys[ii] > max_vy)
                    max_vy = topic.ys[ii];

                if (topic.ys[ii] < min_vy)
                    min_vy = topic.ys[ii];
            }
        }

        if (this.maxx != null)
            max_vx = this.maxx;

        if (this.minx != null)
            min_vx = this.minx;

        if (this.maxy != null)
            max_vy = this.maxy;

        if (this.miny != null)
            min_vy = this.miny;

        if (min_vx == max_vx) {
            max_vx += 0.00001;
            min_vx -= 0.00001;
        }

        if (min_vy == max_vy) {
            max_vy += 0.00001;
            min_vy -= 0.00001;
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(min_x, min_y-3);
        ctx.lineTo(min_x, max_y+3);
        ctx.moveTo(min_x-3, max_y);
        ctx.lineTo(max_x+3, max_y);

        x = ~~((max_x-min_x)/2 + min_x);
        ctx.moveTo(max_x, max_y-3);
        ctx.lineTo(max_x, max_y+3);
        ctx.moveTo(x, max_y-3);
        ctx.lineTo(x, max_y+3);

        y = ~~((max_y-min_y)/2 + min_y);
        ctx.moveTo(min_x-3, min_y);
        ctx.lineTo(min_x+3, min_y);
        ctx.moveTo(min_x-3, y);
        ctx.lineTo(min_x+3, y);

        if (this.zero && max_vx > 0 && min_vx < 0) {
            var xx = (-min_vx) / (max_vx-min_vx);
            xx = (xx*(max_x - min_x)) + min_x;
            ctx.moveTo(~~xx, max_y+3);
            ctx.lineTo(~~xx, min_y);
        }

        if (this.zero && max_vy > 0 && min_vy < 0) {
            var yy = (-min_vy) / (max_vy-min_vy);
            yy = ((1-yy)*(max_y - min_y)) + min_y;
            ctx.moveTo(min_x-3, ~~yy);
            ctx.lineTo(max_x, ~~yy);
        }

        ctx.stroke();

        var valuex = (max_vx-min_vx)/2 + min_vx;
        var valuey = (max_vy-min_vy)/2 + min_vy;
        ctx.fillStyle = '#f0f0f0';
        ctx.font = '9px monospace';

        ctx.fillText(ros.stringize(min_vx),    min_x, max_y+10);
        ctx.fillText(ros.stringize(valuex),     x-15, max_y+10);
        ctx.fillText(ros.stringize(max_vx), max_x-24, max_y+10);

        ctx.fillText(ros.stringize(min_vy), min_x-33, max_y);
        ctx.fillText(ros.stringize(valuey), min_x-33, y+3);
        ctx.fillText(ros.stringize(max_vy), min_x-33, min_y+6);

        for (var i = 0; i < topics.length; i++) {
            ctx.strokeStyle = topics[i].color;
            ctx.fillStyle = topics[i].color;
            ctx.beginPath();

            for (var ii = 0; ii < topics[i].times.length; ii++) {
                var vx = topics[i].xs[ii];
                var vy = topics[i].ys[ii];

                vx = (vx-min_vx) / (max_vx-min_vx);
                vy = (vy-min_vy) / (max_vy-min_vy);

                x = (vx*(max_x - min_x))+min_x;
                y = ((1-vy)*(max_y - min_y))+min_y;

                if (this.lines) {
                    if (ii == 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                } else {
                    ctx.fillRect(~~x, ~~y, 2, 2);
                }
            }

            ctx.stroke();

            ctx.font = '12px monospace';
            ctx.fillText(topics[i].xname, min_x+6, i*24+12 + min_y);
            ctx.fillText(topics[i].yname, min_x+6, i*24+24 + min_y);
        }
    }

    ROSPlot2.prototype.destroy = function() {
        for (var i = 0; i < this.topics.length; i++) {
            this.ros.unsubscribe(this.topics[i].xref);
            this.ros.unsubscribe(this.topics[i].yref);
        }
    }

    return ROSPlot2
})();

/**
 * ROSRange bar range renderer
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * renders range data
 *
 * params:
 *  zero: display zero line
 *  fill: filled rendering
 *  invert: invert the range data
 *  min: minimum value
 *  max: maximum value
 *  buffer: size of buffer in seconds
 */

var ROSRange = (function() {
    function ROSRange(ros, topics) {
        this.ros = ros
        this.topics = []
        this._mbuff = {times:[], max:[], min:[]}

        this.zero = true
        this.fill = true
        this.max = null
        this.min = null
        this.buffer = 5

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        for (var i = 0; i < topics.length; i++) {
            this.addplot(topics[i])
        }
    }

    ROSRange.prototype.addplot = function(name) {
        var self = this
        var topics = this.topics
        var ros = this.ros

        var topic = {
            name: name,
            values: [],
            color: ros.colors[this.topics.length % ros.colors.length],
        }

        topic.ref = ros.subrange(topic.name, function(data) {
            for (var i = 0; i < data.length; i++) {
                topic.values[i] = data[i]
            }
        }, function(newname) {
            console.log('-> ' + newname)
            self.addplot(newname)
        }, function() {
            topics.splice(topics.indexOf(topic), 1)
            ros.unsubscribe(topic.ref)
        })

        topics.push(topic)

        if (topics.length == 1)
            this.title = topic.name
    }

    ROSRange.prototype.render = function(ctx) {
        var topics = this.topics
        var mbuff = this._mbuff
        var ros = this.ros

        var min_y = 1;
        var max_y = ctx.height - 1;
        var min_x = 33;
        var max_x = ctx.width - 1;

        var min_value = +Infinity
        var max_value = -Infinity

        var x, y;
        var count = 0;

        for (var i = 0; i < topics.length; i++) {
            count += topics[i].values.length

            for (var ii = 0; ii < topics[i].values.length; ii++) {
                if (topics[i].values[ii] > max_value)
                    max_value = topics[i].values[ii];

                if (topics[i].values[ii] < min_value)
                    min_value = topics[i].values[ii];
            }
        }

        if (this.buffer) {
            mbuff.times.push(ros.time())
            mbuff.max.push(max_value)
            mbuff.min.push(min_value)
            var min_time = ros.time() - (this.buffer*1000)

            while (mbuff.times.length > 0 &&
                   mbuff.times[0] < min_time) {
                mbuff.times.shift()
                mbuff.max.shift()
                mbuff.min.shift()
            }

            for (var i = 0; i < mbuff.max.length; i++) {
                if (mbuff.max[i] > max_value)
                    max_value = mbuff.max[i]

                if (mbuff.min[i] < min_value)
                    min_value = mbuff.min[i]
            }
        }

        if (this.max != null)
            max_value = this.max

        if (this.min != null)
            min_value = this.min

        if (min_value == max_value) {
            max_value += 0.00001;
            min_value -= 0.00001;
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(min_x, min_y-3);
        ctx.lineTo(min_x, max_y+3);
        ctx.moveTo(min_x-3, max_y);
        ctx.lineTo(max_x+3, max_y);

        x = ~~((max_x-min_x)/2 + min_x);
        ctx.moveTo(max_x, max_y-3);
        ctx.lineTo(max_x, max_y+3);
        ctx.moveTo(x, max_y-3);
        ctx.lineTo(x, max_y+3);

        y = ~~((max_y-min_y)/2 + min_y);
        ctx.moveTo(min_x-3, min_y);
        ctx.lineTo(min_x+3, min_y);
        ctx.moveTo(min_x-3, y);
        ctx.lineTo(min_x+3, y);

        var yy = (-min_value) / (max_value-min_value);
        yy = ((1-yy)*(max_y - min_y)) + min_y;

        if (this.zero && max_value > 0 && min_value < 0) {
            ctx.moveTo(min_x-3, ~~yy);
            ctx.lineTo(max_x, ~~yy);
        }

        ctx.stroke();

        var value = (max_value-min_value)/2 + min_value;
        ctx.fillStyle = '#f0f0f0';
        ctx.font = '9px monospace';

        ctx.fillText(ros.stringize(min_value), min_x-33, max_y);
        ctx.fillText(ros.stringize(value),     min_x-33, y+3);
        ctx.fillText(ros.stringize(max_value), min_x-33, min_y+6);

        var width = (max_x-min_x)/count
        count = 0

        for (var i = 0; i < topics.length; i++) {
            ctx.strokeStyle = topics[i].color;
            ctx.fillStyle = topics[i].color;

            ctx.beginPath();

            if (this.invert) {
                ctx.moveTo(max_x, yy)

                for (var ii=0; ii<topics[i].values.length; ii++,count++) {
                    var v = topics[i].values[ii]
                    v = (v-min_value) / (max_value-min_value)
                    v = ((1-v)*(max_y-min_y)) + min_y

                    ctx.lineTo(max_x - (count  )*width, v)
                    ctx.lineTo(max_x - (count+1)*width, v)
                }

                ctx.lineTo(min_x, yy)
            } else {
                ctx.moveTo(min_x, yy)

                for (var ii=0; ii<topics[i].values.length; ii++,count++) {
                    var v = topics[i].values[ii]
                    v = (v-min_value) / (max_value-min_value)
                    v = ((1-v)*(max_y-min_y)) + min_y

                    ctx.lineTo(min_x + (count  )*width, v)
                    ctx.lineTo(min_x + (count+1)*width, v)
                }

                ctx.lineTo(max_x, yy)
            }

            if (this.fill)
                ctx.fill()
            else
                ctx.stroke()

            ctx.font = '12px monospace';
            ctx.fillText(topics[i].name, min_x+6, (i+1)*12 + min_y);
        }
    }

    ROSRange.prototype.destroy = function() {
        for (var i = 0; i < this.topics.length; i++) {
            this.ros.unsubscribe(this.topics[i].ref)
        }
    }

    return ROSRange
})();

/**
 * ROSRRange radial range renderer
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * renders range data in radial format
 *
 * params:
 *  fill: filled rendering
 *  invert: invert the range data
 *  max: maximum value
 *  deg: rendering angle
 *  buffer: size of buffer in seconds
 */

var ROSRRange = (function() {
    function ROSRRange(ros, topics) {
        this.ros = ros
        this.topics = []
        this._mbuff = {times:[], values:[]}

        this.fill = true
        this.max = null
        this.deg = 180
        this.buffer = 5

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        for (var i = 0; i < topics.length; i++) {
            this.addplot(topics[i])
        }
    }

    ROSRRange.prototype.addplot = function(name) {
        var self = this
        var topics = this.topics
        var ros = this.ros

        var topic = {
            name: name,
            values: [],
            color: ros.colors[this.topics.length % ros.colors.length],
        }

        topic.ref = ros.subrange(topic.name, function(data) {
            for (var i = 0; i < data.length; i++) {
                topic.values[i] = data[i]
            }
        }, function(newname) {
            console.log('-> ' + newname)
            self.addplot(newname)
        }, function() {
            topics.splice(topics.indexOf(topic), 1)
            ros.unsubscribe(topic.ref)
        })

        topics.push(topic)

        if (topics.length == 1)
            this.title = topic.name
    }

    ROSRRange.prototype.render = function(ctx) {
        var topics = this.topics
        var mbuff = this._mbuff
        var ros = this.ros

        var min_y = 1
        var max_y = ctx.height - 10
        var min_x = 5
        var max_x = ctx.width - 5

        var rad = (Math.PI * this.deg/180)
        var dr = (rad-Math.PI)/2
        var center = ctx.width / 2

        var max_r = (max_x-min_x)/2
        var max_my = (dr <= 0) ? max_y : max_y/(Math.sin(dr)+1)
        if (max_my-min_y < max_r) max_r = max_my-min_y

        var min_mx = center - max_r
        var max_mx = center + max_r

        var max_value = 0

        var x, y;
        var count = 0

        for (var i = 0; i < topics.length; i++) {
            count += topics[i].values.length

            for (var ii = 0; ii < topics[i].values.length; ii++) {
                if (topics[i].values[ii] > max_value)
                    max_value = topics[i].values[ii]
            }
        }

        if (this.buffer) {
            mbuff.times.push(ros.time())
            mbuff.values.push(max_value)
            var min_time = ros.time() - (this.buffer*1000)

            while (mbuff.times.length > 0 &&
                   mbuff.times[0] < min_time) {
                mbuff.times.shift()
                mbuff.values.shift()
            }

            for (var i = 0; i < mbuff.values.length; i++) {
                if (mbuff.values[i] > max_value)
                    max_value = mbuff.values[i]
            }
        }

        if (this.max != null)
            max_value = this.max

        ctx.lineWidth = 2
        ctx.strokeStyle = '#555'
        ctx.beginPath()
        ctx.moveTo(center, max_my)
        ctx.arc(center, max_my, max_r, Math.PI-dr, 2*Math.PI+dr);
        ctx.lineTo(center, max_my)
        ctx.stroke()

        ctx.fillStyle = '#f0f0f0'
        ctx.font = '9px monospace'
        ctx.fillText(ros.stringize(max_value), min_mx+6, max_y+9)
        ctx.fillText(ros.stringize(0), center, max_y+9)
        ctx.fillText(ros.stringize(max_value), max_mx-33, max_y+9)

        var width = rad/count
        count = 0

        for (var i = 0; i < topics.length; i++) {
            ctx.strokeStyle = topics[i].color
            ctx.fillStyle = topics[i].color

            ctx.beginPath();
            ctx.moveTo(center, max_my)

            if (this.invert) {
                for (var ii=0; ii<topics[i].values.length; ii++,count++) {
                    ctx.arc(center, max_my,
                            max_r * (topics[i].values[ii]/max_value),
                            2*Math.PI - (count+1)*width + dr,
                            2*Math.PI - (count  )*width + dr);
                }
            } else {
                for (var ii=0; ii<topics[i].values.length; ii++,count++) {
                    ctx.arc(center, max_my, 
                            max_r * (topics[i].values[ii]/max_value), 
                            (count  )*width + Math.PI - dr,
                            (count+1)*width + Math.PI - dr);
                }
            }

            if (this.fill)
                ctx.fill()
            else
                ctx.stroke()

            ctx.font = '12px monospace'
            ctx.fillText(topics[i].name, min_x, (i+1)*12 + min_y)
        }
    }

    ROSRRange.prototype.destroy = function() {
        for (var i = 0; i < this.topics.length; i++) {
            this.ros.unsubscribe(this.topics[i].ref)
        }
    }

    return ROSRRange
})();

/**
 * ROSWatch image watcher
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * renders images in realtime
 *
 * params:
 *  quality: quality of compression from 1 to 100
 *  invert: invert the image
 */

var ROSWatch = (function() {
    function ROSWatch(ros, topics) {
        this.ros = ros

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        this.topic = topics[0]
        this.title = this.topic
        this.image = new Image()
    }

    ROSWatch.prototype.render = function(ctx) {
        var image = this.image

        if (ctx.width != this.width || ctx.height != this.height) {
            this.width = ctx.width
            this.height = ctx.height

            image.src = this.ros.mjpeg(this.topic, 
                                       this.width, this.height,
                                       this.quality,
                                       this.invert);
        }

        if (!image || image.width*image.height <= 0) {
            ctx.fillStyle = '#f0f0f0'
            ctx.font = '12px monospace'
            ctx.fillText('No Stream!', 12, 12)
        } else {
            ctx.drawImage(image, 0, 0, this.width, this.height);
        }
    }

    return ROSWatch
})();

/**
 * ROSMap gps location rendering
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * plots gps coordinates on a map
 * does not take into account altitude
 *
 * params:
 *  lines: display lines or points
 *  zoom: zoom level of map
 *  type: type of map to render on
 *  buffer: size of buffer in seconds
 */

var ROSMap = (function() {
    function ROSMap(ros, topics) {
        this.ros = ros
        this.topics = []

        this.lines = true
        this.zoom = 17
        this.type = 'satellite'
        this.buffer = 10

        if (!(topics instanceof Array))
            topics = topics.split(/\s*,\s*/)

        var topic = {
            name: topics[0],
            times: [],
            lats: [],
            longs: [],
            color: ros.colors[0]
        }

        this.ref = this.ros.subscribe(topic.name, function(data) {
            topic.times.push(ros.time())
            topic.lats.push(data.latitude)
            topic.longs.push(data.longitude)
        })

        this.topic = topic
        this.title = topic.name
        this.image = new Image()
    }

    ROSMap.prototype.center = function(lat, long) {
        var url = 'http://maps.googleapis.com/maps/api/staticmap?'
        url += 'center=' + lat + ',' + long
        url += '&zoom=' + this.zoom
        url += '&size=' + this.width + 'x' + this.height
        url += '&maptype=' + this.type
        url += '&sensor=true'

        this.image.src = url
        this.origin_lat = lat
        this.origin_long = long

        this.scale = 1 << this.zoom
        this.long_deg = 256 / 360
        this.long_rad = 256 / (2 * Math.PI)
    }

    ROSMap.prototype.pixelx = function(long) {
        var x = (this.origin_long-long) * this.long_deg
        return x * this.scale
    }

    ROSMap.prototype.pixely = function(lat) {
        var siny = Math.sin((this.origin_lat-lat) * (Math.PI / 180))
        if (siny > 0.9999)       siny = 0.9999
        else if (siny < -0.9999) siny = -0.9999

        var y = 0.5 * Math.log((1+siny) / (1-siny)) * -this.long_rad
        return y * this.scale
    }

    ROSMap.prototype.render = function(ctx) {
        var image = this.image
        var topic = this.topic
        var ros = this.ros

        var last = this.topic.times.length - 1
        var lastlat = this.topic.lats[last]
        var lastlong = this.topic.longs[last]

        if (ctx.width != this.width || ctx.height != this.height || 
            Math.abs(this.pixelx(lastlong)) > this.width/4 ||
            Math.abs(this.pixely(lastlat)) > this.height/4) {
            this.width = ctx.width
            this.height = ctx.height

            var last = this.topic.times.length - 1
            this.center(lastlat, lastlong)
        }

        ctx.drawImage(image, 0, 0, this.width, this.height)

        
        var min_time = ros.time() - this.buffer*1000

        while (topic.times.length > 0 &&
               topic.times[0] < min_time-1000) {
            topic.times.shift();
            topic.lats.shift();
            topic.longs.shift();
        }


        ctx.strokeStyle = topic.color;
        ctx.fillStyle = topic.color;
        ctx.beginPath();

        for (var ii = 0; ii < topic.times.length; ii++) {
            var x = this.pixelx(topic.longs[ii])
            var y = this.pixely(topic.lats[ii])

            x += this.width/2
            y += this.height/2

            if (this.lines) {
                if (ii == 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            } else {
                ctx.fillRect(~~x, ~~y, 4, 4);
            }
        }

        ctx.stroke();

        ctx.font = '12px monospace';
        ctx.fillText(topic.name, 6, 12);
    }

    ROSMap.prototype.destroy = function() {
        this.ros.unsubscribe(this.ref);
    }

    return ROSMap
})();

/**
 * ROSWebKit automatic attacher
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 */

var roswebkit = (function() {
    var plots = [
        { name: 'rosplot', 
          plot: ROSPlot, 
          params: ['lines','zero','miny','maxy','buffer']
        },
        { name: 'rosplot2', 
          plot: ROSPlot2,
          params: ['lines', 'zero', 'miny', 'maxy', 
                   'minx', 'maxx', 'buffer']
        },
        { name: 'rosrange', 
          plot: ROSRange,
          params: ['zero', 'fill', 'invert', 'min', 'max', 'buffer']
        },
        { name: 'rosrrange', 
          plot: ROSRRange,
          params: ['fill', 'invert', 'max', 'deg', 'buffer']
        },
        { name: 'rosecho', 
          plot: ROSEcho,
          params: []
        },
        { name: 'roswatch', 
          plot: ROSWatch,
          params: ['quality', 'invert']
        },
        { name: 'rosmap',
          plot: ROSMap,
          params: ['lines', 'zoom', 'type', 'buffer']
        }
    ]

    var requestFrame = (
        window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback) { setInterval(callback, 100); } 
    );


    function flatten() {
        for (var p = 0; p < plots.length; p++) {
            while (true) {
                var elem = document.getElementsByTagName(plots[p].name)[0]

                if (!elem)
                    break

                var parent = elem.parentElement
                var attr = elem.attributes
                var canvas = document.createElement('canvas')

                for (var a = 0; a < attr.length; a++) {
                    canvas.setAttribute(attr[a].name, attr[a].value)
                }

                canvas.innerHTML = elem.innerHTML
                canvas.classList.add(plots[p].name)

                parent.replaceChild(canvas, elem)
            }
        }
    }

    function addelement(ros, elem, plot) {
        var topics = elem.getAttribute('topic').split(/\s*,\s*/)
        var res = new plot.plot(ros, topics)

        elem.style.setProperty('background-color', 'black')

        for (var a = 0; a < plot.params.length; a++) {
            var param = elem.getAttribute(plot.params[a])

            if (param)
                res[plot.params[a]] = eval(param)
        }
        
        return function() {
            elem.width = elem.width

            var ctx = elem.getContext('2d')
            ctx.width = elem.width
            ctx.height = elem.height

            res.render(ctx)
        }
    }

    function roswebkit(bridgeport, mjpegport) {
        var ros = new ROSManager(bridgeport, mjpegport)
        var elements = []

        flatten()

        for (var p = 0; p < plots.length; p++) {
            var elems = document.getElementsByClassName(plots[p].name)

            for (var e = 0; e < elems.length; e++) {
                elements.push(addelement(ros, elems[e], plots[p]))
            }
        }

        function frame() {
            for (var i = 0; i < elements.length; i++) {
                elements[i]()
            }

            requestFrame(frame)
        }

        frame()
    }

    return roswebkit
})();

!function(d,b){var e=Array.isArray?Array.isArray:function h(k){return Object.prototype.toString.call(k)==="[object Array]"};var f=10;function i(){this._events={};if(this._conf){a.call(this,this._conf)}}function a(k){if(k){this._conf=k;k.delimiter&&(this.delimiter=k.delimiter);k.maxListeners&&(this._events.maxListeners=k.maxListeners);k.wildcard&&(this.wildcard=k.wildcard);k.newListener&&(this.newListener=k.newListener);if(this.wildcard){this.listenerTree={}}}}function j(k){this._events={};this.newListener=false;a.call(this,k)}function c(l,t,y,n){if(!y){return[]}var u=[],q,p,w,x,s,r,m,k=t.length,o=t[n],v=t[n+1];if(n===k&&y._listeners){if(typeof y._listeners==="function"){l&&l.push(y._listeners);return[y]}else{for(q=0,p=y._listeners.length;q<p;q++){l&&l.push(y._listeners[q])}return[y]}}if((o==="*"||o==="**")||y[o]){if(o==="*"){for(w in y){if(w!=="_listeners"&&y.hasOwnProperty(w)){u=u.concat(c(l,t,y[w],n+1))}}return u}else{if(o==="**"){m=(n+1===k||(n+2===k&&v==="*"));if(m&&y._listeners){u=u.concat(c(l,t,y,k))}for(w in y){if(w!=="_listeners"&&y.hasOwnProperty(w)){if(w==="*"||w==="**"){if(y[w]._listeners&&!m){u=u.concat(c(l,t,y[w],k))}u=u.concat(c(l,t,y[w],n))}else{if(w===v){u=u.concat(c(l,t,y[w],n+2))}else{u=u.concat(c(l,t,y[w],n))}}}}return u}}u=u.concat(c(l,t,y[o],n+1))}x=y["*"];if(x){c(l,t,x,n+1)}s=y["**"];if(s){if(n<k){if(s._listeners){c(l,t,s,k)}for(w in s){if(w!=="_listeners"&&s.hasOwnProperty(w)){if(w===v){c(l,t,s[w],n+2)}else{if(w===o){c(l,t,s[w],n+1)}else{r={};r[w]=s[w];c(l,t,{"**":r},n+1)}}}}}else{if(s._listeners){c(l,t,s,k)}else{if(s["*"]&&s["*"]._listeners){c(l,t,s["*"],k)}}}}return u}function g(q,r){q=typeof q==="string"?q.split(this.delimiter):q.slice();for(var p=0,n=q.length;p+1<n;p++){if(q[p]==="**"&&q[p+1]==="**"){return}}var l=this.listenerTree;var o=q.shift();while(o){if(!l[o]){l[o]={}}l=l[o];if(q.length===0){if(!l._listeners){l._listeners=r}else{if(typeof l._listeners==="function"){l._listeners=[l._listeners,r]}else{if(e(l._listeners)){l._listeners.push(r);if(!l._listeners.warned){var k=f;if(typeof this._events.maxListeners!=="undefined"){k=this._events.maxListeners}if(k>0&&l._listeners.length>k){l._listeners.warned=true;console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",l._listeners.length);console.trace()}}}}}return true}o=q.shift()}return true}j.prototype.delimiter=".";j.prototype.setMaxListeners=function(k){this._events||i.call(this);this._events.maxListeners=k;if(!this._conf){this._conf={}}this._conf.maxListeners=k};j.prototype.event="";j.prototype.once=function(l,k){this.many(l,1,k);return this};j.prototype.many=function(n,k,m){var l=this;if(typeof m!=="function"){throw new Error("many only accepts instances of Function")}function o(){if(--k===0){l.off(n,o)}m.apply(this,arguments)}o._origin=m;this.on(n,o);return l};j.prototype.emit=function(){this._events||i.call(this);var r=arguments[0];if(r==="newListener"&&!this.newListener){if(!this._events.newListener){return false}}if(this._all){var k=arguments.length;var m=new Array(k-1);for(var n=1;n<k;n++){m[n-1]=arguments[n]}for(n=0,k=this._all.length;n<k;n++){this.event=r;this._all[n].apply(this,m)}}if(r==="error"){if(!this._all&&!this._events.error&&!(this.wildcard&&this.listenerTree.error)){if(arguments[1] instanceof Error){throw arguments[1]}else{throw new Error("Uncaught, unspecified 'error' event.")}return false}}var q;if(this.wildcard){q=[];var p=typeof r==="string"?r.split(this.delimiter):r.slice();c.call(this,q,p,this.listenerTree,0)}else{q=this._events[r]}if(typeof q==="function"){this.event=r;if(arguments.length===1){q.call(this)}else{if(arguments.length>1){switch(arguments.length){case 2:q.call(this,arguments[1]);break;case 3:q.call(this,arguments[1],arguments[2]);break;default:var k=arguments.length;var m=new Array(k-1);for(var n=1;n<k;n++){m[n-1]=arguments[n]}q.apply(this,m)}}}return true}else{if(q){var k=arguments.length;var m=new Array(k-1);for(var n=1;n<k;n++){m[n-1]=arguments[n]}var o=q.slice();for(var n=0,k=o.length;n<k;n++){this.event=r;o[n].apply(this,m)}return(o.length>0)||this._all}else{return this._all}}};j.prototype.on=function(l,n){if(typeof l==="function"){this.onAny(l);return this}if(typeof n!=="function"){throw new Error("on only accepts instances of Function")}this._events||i.call(this);this.emit("newListener",l,n);if(this.wildcard){g.call(this,l,n);return this}if(!this._events[l]){this._events[l]=n}else{if(typeof this._events[l]==="function"){this._events[l]=[this._events[l],n]}else{if(e(this._events[l])){this._events[l].push(n);if(!this._events[l].warned){var k=f;if(typeof this._events.maxListeners!=="undefined"){k=this._events.maxListeners}if(k>0&&this._events[l].length>k){this._events[l].warned=true;console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",this._events[l].length);console.trace()}}}}}return this};j.prototype.onAny=function(k){if(!this._all){this._all=[]}if(typeof k!=="function"){throw new Error("onAny only accepts instances of Function")}this._all.push(k);return this};j.prototype.addListener=j.prototype.on;j.prototype.off=function(q,l){if(typeof l!=="function"){throw new Error("removeListener only takes instances of Function")}var m,t=[];if(this.wildcard){var r=typeof q==="string"?q.split(this.delimiter):q.slice();t=c.call(this,null,r,this.listenerTree,0)}else{if(!this._events[q]){return this}m=this._events[q];t.push({_listeners:m})}for(var s=0;s<t.length;s++){var p=t[s];m=p._listeners;if(e(m)){var o=-1;for(var n=0,k=m.length;n<k;n++){if(m[n]===l||(m[n].listener&&m[n].listener===l)||(m[n]._origin&&m[n]._origin===l)){o=n;break}}if(o<0){return this}if(this.wildcard){p._listeners.splice(o,1)}else{this._events[q].splice(o,1)}if(m.length===0){if(this.wildcard){delete p._listeners}else{delete this._events[q]}}}else{if(m===l||(m.listener&&m.listener===l)||(m._origin&&m._origin===l)){if(this.wildcard){delete p._listeners}else{delete this._events[q]}}}}return this};j.prototype.offAny=function(o){var n=0,k=0,m;if(o&&this._all&&this._all.length>0){m=this._all;for(n=0,k=m.length;n<k;n++){if(o===m[n]){m.splice(n,1);return this}}}else{this._all=[]}return this};j.prototype.removeListener=j.prototype.off;j.prototype.removeAllListeners=function(o){if(arguments.length===0){!this._events||i.call(this);return this}if(this.wildcard){var n=typeof o==="string"?o.split(this.delimiter):o.slice();var m=c.call(this,null,n,this.listenerTree,0);for(var l=0;l<m.length;l++){var k=m[l];k._listeners=null}}else{if(!this._events[o]){return this}this._events[o]=null}return this};j.prototype.listeners=function(m){if(this.wildcard){var k=[];var l=typeof m==="string"?m.split(this.delimiter):m.slice();c.call(this,k,l,this.listenerTree,0);return k}this._events||i.call(this);if(!this._events[m]){this._events[m]=[]}if(!e(this._events[m])){this._events[m]=[this._events[m]]}return this._events[m]};j.prototype.listenersAny=function(){if(this._all){return this._all}else{return[]}};if(typeof define==="function"&&define.amd){define(function(){return j})}else{d.EventEmitter2=j}}(typeof process!=="undefined"&&typeof process.title!=="undefined"&&typeof exports!=="undefined"?exports:window);var ROSLIB=ROSLIB||{REVISION:"6"};ROSLIB.URDF_SPHERE=0,ROSLIB.URDF_BOX=1,ROSLIB.URDF_CYLINDER=2,ROSLIB.URDF_MESH=3,ROSLIB.ActionClient=function(t){var e=this;t=t||{},this.ros=t.ros,this.serverName=t.serverName,this.actionName=t.actionName,this.timeout=t.timeout,this.goals={};var i=!1,s=new ROSLIB.Topic({ros:this.ros,name:this.serverName+"/feedback",messageType:this.actionName+"Feedback"}),n=new ROSLIB.Topic({ros:this.ros,name:this.serverName+"/status",messageType:"actionlib_msgs/GoalStatusArray"}),o=new ROSLIB.Topic({ros:this.ros,name:this.serverName+"/result",messageType:this.actionName+"Result"});this.goalTopic=new ROSLIB.Topic({ros:this.ros,name:this.serverName+"/goal",messageType:this.actionName+"Goal"}),this.cancelTopic=new ROSLIB.Topic({ros:this.ros,name:this.serverName+"/cancel",messageType:"actionlib_msgs/GoalID"}),this.goalTopic.advertise(),this.cancelTopic.advertise(),n.subscribe(function(t){i=!0,t.status_list.forEach(function(t){var i=e.goals[t.goal_id.id];i&&i.emit("status",t)})}),s.subscribe(function(t){var i=e.goals[t.status.goal_id.id];i&&(i.emit("status",t.status),i.emit("feedback",t.feedback))}),o.subscribe(function(t){var i=e.goals[t.status.goal_id.id];i&&(i.emit("status",t.status),i.emit("result",t.result))}),this.timeout&&setTimeout(function(){i||e.emit("timeout")},this.timeout)},ROSLIB.ActionClient.prototype.__proto__=EventEmitter2.prototype,ROSLIB.ActionClient.prototype.cancel=function(){var t=new ROSLIB.Message;this.cancelTopic.publish(t)},ROSLIB.Goal=function(t){var e=this;this.actionClient=t.actionClient,this.goalMessage=t.goalMessage,this.isFinished=!1;var i=new Date;this.goalID="goal_"+Math.random()+"_"+i.getTime(),this.goalMessage=new ROSLIB.Message({goal_id:{stamp:{secs:0,nsecs:0},id:this.goalID},goal:this.goalMessage}),this.on("status",function(t){e.status=t}),this.on("result",function(t){e.isFinished=!0,e.result=t}),this.on("feedback",function(t){e.feedback=t}),this.actionClient.goals[this.goalID]=this},ROSLIB.Goal.prototype.__proto__=EventEmitter2.prototype,ROSLIB.Goal.prototype.send=function(t){var e=this;e.actionClient.goalTopic.publish(e.goalMessage),t&&setTimeout(function(){e.isFinished||e.emit("timeout")},t)},ROSLIB.Goal.prototype.cancel=function(){var t=new ROSLIB.Message({id:this.goalID});this.actionClient.cancelTopic.publish(t)},ROSLIB.Message=function(t){var e=this;t=t||{},Object.keys(t).forEach(function(i){e[i]=t[i]})},ROSLIB.Param=function(t){t=t||{},this.ros=t.ros,this.name=t.name},ROSLIB.Param.prototype.get=function(t){var e=new ROSLIB.Service({ros:this.ros,name:"/rosapi/get_param",serviceType:"rosapi/GetParam"}),i=new ROSLIB.ServiceRequest({name:this.name,value:JSON.stringify("")});e.callService(i,function(e){var i=JSON.parse(e.value);t(i)})},ROSLIB.Param.prototype.set=function(t){var e=new ROSLIB.Service({ros:this.ros,name:"/rosapi/set_param",serviceType:"rosapi/SetParam"}),i=new ROSLIB.ServiceRequest({name:this.name,value:JSON.stringify(t)});e.callService(i,function(){})},ROSLIB.Ros=function(t){t=t||{};var e=t.url;this.socket=null,this.idCounter=0,this.setMaxListeners(0),e&&this.connect(e)},ROSLIB.Ros.prototype.__proto__=EventEmitter2.prototype,ROSLIB.Ros.prototype.connect=function(t){function e(t){a.emit("connection",t)}function i(t){a.emit("close",t)}function s(t){a.emit("error",t)}function n(t,e){var i=new Image;i.onload=function(){var t=document.createElement("canvas"),s=t.getContext("2d");t.width=i.width,t.height=i.height,s.drawImage(i,0,0);for(var n=s.getImageData(0,0,i.width,i.height).data,o="",a=0;n.length>a;a+=4)o+=String.fromCharCode(n[a],n[a+1],n[a+2]);var r=JSON.parse(o);e(r)},i.src="data:image/png;base64,"+t.data}function o(t){function e(t){"publish"===t.op?a.emit(t.topic,t.msg):"service_response"===t.op&&a.emit(t.id,t.values)}var i=JSON.parse(t.data);"png"===i.op?n(i,function(t){e(t)}):e(i)}var a=this;this.socket=new WebSocket(t),this.socket.onopen=e,this.socket.onclose=i,this.socket.onerror=s,this.socket.onmessage=o},ROSLIB.Ros.prototype.close=function(){this.socket&&this.socket.close()},ROSLIB.Ros.prototype.authenticate=function(t,e,i,s,n,o,a){var r={op:"auth",mac:t,client:e,dest:i,rand:s,t:n,level:o,end:a};this.callOnConnection(r)},ROSLIB.Ros.prototype.callOnConnection=function(t){var e=this,i=JSON.stringify(t);this.socket&&this.socket.readyState===WebSocket.OPEN?e.socket.send(i):e.once("connection",function(){e.socket.send(i)})},ROSLIB.Ros.prototype.getTopics=function(t){var e=new ROSLIB.Service({ros:this,name:"/rosapi/topics",serviceType:"rosapi/Topics"}),i=new ROSLIB.ServiceRequest;e.callService(i,function(e){t(e.topics)})},ROSLIB.Ros.prototype.getServices=function(t){var e=new ROSLIB.Service({ros:this,name:"/rosapi/services",serviceType:"rosapi/Services"}),i=new ROSLIB.ServiceRequest;e.callService(i,function(e){t(e.services)})},ROSLIB.Ros.prototype.getParams=function(t){var e=new ROSLIB.Service({ros:this,name:"/rosapi/get_param_names",serviceType:"rosapi/GetParamNames"}),i=new ROSLIB.ServiceRequest;e.callService(i,function(e){t(e.names)})},ROSLIB.Service=function(t){t=t||{},this.ros=t.ros,this.name=t.name,this.serviceType=t.serviceType},ROSLIB.Service.prototype.callService=function(t,e){this.ros.idCounter++;var i="call_service:"+this.name+":"+this.ros.idCounter;this.ros.once(i,function(t){var i=new ROSLIB.ServiceResponse(t);e(i)});var s=[];Object.keys(t).forEach(function(e){s.push(t[e])});var n={op:"call_service",id:i,service:this.name,args:s};this.ros.callOnConnection(n)},ROSLIB.ServiceRequest=function(t){var e=this;t=t||{},Object.keys(t).forEach(function(i){e[i]=t[i]})},ROSLIB.ServiceResponse=function(t){var e=this;t=t||{},Object.keys(t).forEach(function(i){e[i]=t[i]})},ROSLIB.Topic=function(t){t=t||{},this.ros=t.ros,this.name=t.name,this.messageType=t.messageType,this.isAdvertised=!1,this.compression=t.compression||"none",this.throttle_rate=t.throttle_rate||0,this.compression&&"png"!==this.compression&&"none"!==this.compression&&this.emit("warning",this.compression+" compression is not supported. No compression will be used."),0>this.throttle_rate&&(this.emit("warning",this.throttle_rate+" is not allowed. Set to 0"),this.throttle_rate=0)},ROSLIB.Topic.prototype.__proto__=EventEmitter2.prototype,ROSLIB.Topic.prototype.subscribe=function(t){var e=this;this.on("message",function(e){t(e)}),this.ros.on(this.name,function(t){var i=new ROSLIB.Message(t);e.emit("message",i)}),this.ros.idCounter++;var i="subscribe:"+this.name+":"+this.ros.idCounter,s={op:"subscribe",id:i,type:this.messageType,topic:this.name,compression:this.compression,throttle_rate:this.throttle_rate};this.ros.callOnConnection(s)},ROSLIB.Topic.prototype.unsubscribe=function(){this.ros.removeAllListeners([this.name]),this.ros.idCounter++;var t="unsubscribe:"+this.name+":"+this.ros.idCounter,e={op:"unsubscribe",id:t,topic:this.name};this.ros.callOnConnection(e)},ROSLIB.Topic.prototype.advertise=function(){this.ros.idCounter++;var t="advertise:"+this.name+":"+this.ros.idCounter,e={op:"advertise",id:t,type:this.messageType,topic:this.name};this.ros.callOnConnection(e),this.isAdvertised=!0},ROSLIB.Topic.prototype.unadvertise=function(){this.ros.idCounter++;var t="unadvertise:"+this.name+":"+this.ros.idCounter,e={op:"unadvertise",id:t,topic:this.name};this.ros.callOnConnection(e),this.isAdvertised=!1},ROSLIB.Topic.prototype.publish=function(t){this.isAdvertised||this.advertise(),this.ros.idCounter++;var e="publish:"+this.name+":"+this.ros.idCounter,i={op:"publish",id:e,topic:this.name,msg:t};this.ros.callOnConnection(i)},ROSLIB.Pose=function(t){t=t||{},this.position=new ROSLIB.Vector3(t.position),this.orientation=new ROSLIB.Quaternion(t.orientation)},ROSLIB.Pose.prototype.applyTransform=function(t){this.position.multiplyQuaternion(t.rotation),this.position.add(t.translation);var e=t.rotation.clone();e.multiply(this.orientation),this.orientation=e},ROSLIB.Pose.prototype.clone=function(){return new ROSLIB.Pose(this)},ROSLIB.Quaternion=function(t){t=t||{},this.x=t.x||0,this.y=t.y||0,this.z=t.z||0,this.w=t.w||1},ROSLIB.Quaternion.prototype.conjugate=function(){this.x*=-1,this.y*=-1,this.z*=-1},ROSLIB.Quaternion.prototype.normalize=function(){var t=Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w);0===t?(this.x=0,this.y=0,this.z=0,this.w=1):(t=1/t,this.x=this.x*t,this.y=this.y*t,this.z=this.z*t,this.w=this.w*t)},ROSLIB.Quaternion.prototype.invert=function(){this.conjugate(),this.normalize()},ROSLIB.Quaternion.prototype.multiply=function(t){var e=this.x*t.w+this.y*t.z-this.z*t.y+this.w*t.x,i=-this.x*t.z+this.y*t.w+this.z*t.x+this.w*t.y,s=this.x*t.y-this.y*t.x+this.z*t.w+this.w*t.z,n=-this.x*t.x-this.y*t.y-this.z*t.z+this.w*t.w;this.x=e,this.y=i,this.z=s,this.w=n},ROSLIB.Quaternion.prototype.clone=function(){return new ROSLIB.Quaternion(this)},ROSLIB.Transform=function(t){t=t||{},this.translation=new ROSLIB.Vector3(t.translation),this.rotation=new ROSLIB.Quaternion(t.rotation)},ROSLIB.Transform.prototype.clone=function(){return new ROSLIB.Transform(this)},ROSLIB.Vector3=function(t){t=t||{},this.x=t.x||0,this.y=t.y||0,this.z=t.z||0},ROSLIB.Vector3.prototype.add=function(t){this.x+=t.x,this.y+=t.y,this.z+=t.z},ROSLIB.Vector3.prototype.subtract=function(t){this.x-=t.x,this.y-=t.y,this.z-=t.z},ROSLIB.Vector3.prototype.multiplyQuaternion=function(t){var e=t.w*this.x+t.y*this.z-t.z*this.y,i=t.w*this.y+t.z*this.x-t.x*this.z,s=t.w*this.z+t.x*this.y-t.y*this.x,n=-t.x*this.x-t.y*this.y-t.z*this.z;this.x=e*t.w+n*-t.x+i*-t.z-s*-t.y,this.y=i*t.w+n*-t.y+s*-t.x-e*-t.z,this.z=s*t.w+n*-t.z+e*-t.y-i*-t.x},ROSLIB.Vector3.prototype.clone=function(){return new ROSLIB.Vector3(this)},ROSLIB.TFClient=function(t){t=t||{},this.ros=t.ros,this.fixedFrame=t.fixedFrame||"/base_link",this.angularThres=t.angularThres||2,this.transThres=t.transThres||.01,this.rate=t.rate||10,this.goalUpdateDelay=t.goalUpdateDelay||50,this.currentGoal=!1,this.frameInfos={},this.goalUpdateRequested=!1,this.actionClient=new ROSLIB.ActionClient({ros:this.ros,serverName:"/tf2_web_republisher",actionName:"tf2_web_republisher/TFSubscriptionAction"})},ROSLIB.TFClient.prototype.processFeedback=function(t){var e=this;t.transforms.forEach(function(t){var i=t.child_frame_id,s=e.frameInfos[i];void 0!==s&&(s.transform=new ROSLIB.Transform({translation:t.transform.translation,rotation:t.transform.rotation}),s.cbs.forEach(function(t){t(s.transform)}))})},ROSLIB.TFClient.prototype.updateGoal=function(){this.currentGoal&&this.currentGoal.cancel();var t={source_frames:[],target_frame:this.fixedFrame,angular_thres:this.angularThres,trans_thres:this.transThres,rate:this.rate};for(var e in this.frameInfos)t.source_frames.push(e);this.currentGoal=new ROSLIB.Goal({actionClient:this.actionClient,goalMessage:t}),this.currentGoal.on("feedback",this.processFeedback.bind(this)),this.currentGoal.send(),this.goalUpdateRequested=!1},ROSLIB.TFClient.prototype.subscribe=function(t,e){"/"===t[0]&&(t=t.substring(1)),void 0===this.frameInfos[t]?(this.frameInfos[t]={cbs:[]},this.goalUpdateRequested||(setTimeout(this.updateGoal.bind(this),this.goalUpdateDelay),this.goalUpdateRequested=!0)):void 0!==this.frameInfos[t].transform&&e(this.frameInfos[t].transform),this.frameInfos[t].cbs.push(e)},ROSLIB.TFClient.prototype.unsubscribe=function(t,e){var i=this.frameInfos[t];if(void 0!==i){var s=i.cbs.indexOf(e);s>=0&&(i.cbs.splice(s,1),0===i.cbs.length&&delete this.frameInfos[t],this.needUpdate=!0)}},ROSLIB.UrdfBox=function(t){t=t||{};var e=this,i=t.xml;this.dimension=null,this.type=null;var s=function(t){this.type=ROSLIB.URDF_BOX;var i=t.getAttribute("size").split(" ");e.dimension=new ROSLIB.Vector3({x:parseFloat(i[0]),y:parseFloat(i[1]),z:parseFloat(i[2])})};s(i)},ROSLIB.UrdfColor=function(t){t=t||{};var e=this,i=t.xml;this.r=null,this.g=null,this.b=null,this.a=null;var s=function(t){var i=t.getAttribute("rgba").split(" ");return e.r=parseFloat(i[0]),e.g=parseFloat(i[1]),e.b=parseFloat(i[2]),e.a=parseFloat(i[3]),!0};s(i)},ROSLIB.UrdfCylinder=function(t){t=t||{};var e=this,i=t.xml;this.type=null,this.length=null,this.radius=null;var s=function(t){e.type=ROSLIB.URDF_CYLINDER,e.length=parseFloat(t.getAttribute("length")),e.radius=parseFloat(t.getAttribute("radius"))};s(i)},ROSLIB.UrdfLink=function(t){t=t||{};var e=this,i=t.xml;this.name=null,this.visual=null;var s=function(t){e.name=t.getAttribute("name");var i=t.getElementsByTagName("visual");i.length>0&&(e.visual=new ROSLIB.UrdfVisual({xml:i[0]}))};s(i)},ROSLIB.UrdfMaterial=function(t){t=t||{};var e=this,i=t.xml;this.name=null,this.textureFilename=null,this.color=null;var s=function(t){e.name=t.getAttribute("name");var i=t.getElementsByTagName("texture");i.length>0&&(e.textureFilename=i[0].getAttribute("filename"));var s=t.getElementsByTagName("color");s.length>0&&(e.color=new ROSLIB.UrdfColor({xml:s[0]}))};s(i)},ROSLIB.UrdfMesh=function(t){t=t||{};var e=this,i=t.xml;this.filename=null,this.scale=null,this.type=null;var s=function(t){e.type=ROSLIB.URDF_MESH,e.filename=t.getAttribute("filename");var i=t.getAttribute("scale");if(i){var s=i.split(" ");e.scale=new ROSLIB.Vector3({x:parseFloat(s[0]),y:parseFloat(s[1]),z:parseFloat(s[2])})}};s(i)},ROSLIB.UrdfModel=function(t){t=t||{};var e=this,i=t.xml,s=t.string;this.materials=[],this.links=[];var n=function(t){var i=t.evaluate("//robot",t,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;e.name=i.getAttribute("name");for(var s in i.childNodes){var n=i.childNodes[s];if("material"===n.tagName){var o=new ROSLIB.UrdfMaterial({xml:n});e.materials[o.name]?console.warn("Material "+o.name+"is not unique."):e.materials[o.name]=o}else if("link"===n.tagName){var a=new ROSLIB.UrdfLink({xml:n});e.links[a.name]?console.warn("Link "+a.name+" is not unique."):(a.visual&&a.visual.material&&(e.materials[a.visual.material.name]?a.visual.material=e.materials[a.visual.material.name]:a.visual.material&&(e.materials[a.visual.material.name]=a.visual.material)),e.links[a.name]=a)}}};if(s){var o=new DOMParser;i=o.parseFromString(s,"text/xml")}n(i)},ROSLIB.UrdfSphere=function(t){t=t||{};var e=this,i=t.xml;this.radius=null,this.type=null;var s=function(t){e.type=ROSLIB.URDF_SPHERE,e.radius=parseFloat(t.getAttribute("radius"))};s(i)},ROSLIB.UrdfVisual=function(t){t=t||{};var e=this,i=t.xml;this.origin=null,this.geometry=null,this.material=null;var s=function(t){var i=t.getElementsByTagName("origin");if(0===i.length)e.origin=new ROSLIB.Pose;else{var s=i[0].getAttribute("xyz"),n=new ROSLIB.Vector3;s&&(s=s.split(" "),n=new ROSLIB.Vector3({x:parseFloat(s[0]),y:parseFloat(s[1]),z:parseFloat(s[2])}));var o=i[0].getAttribute("rpy"),a=new ROSLIB.Quaternion;if(o){o=o.split(" ");var r=parseFloat(o[0]),h=parseFloat(o[1]),c=parseFloat(o[2]),l=r/2,u=h/2,p=c/2,m=Math.sin(l)*Math.cos(u)*Math.cos(p)-Math.cos(l)*Math.sin(u)*Math.sin(p),f=Math.cos(l)*Math.sin(u)*Math.cos(p)+Math.sin(l)*Math.cos(u)*Math.sin(p),v=Math.cos(l)*Math.cos(u)*Math.sin(p)-Math.sin(l)*Math.sin(u)*Math.cos(p),S=Math.cos(l)*Math.cos(u)*Math.cos(p)+Math.sin(l)*Math.sin(u)*Math.sin(p);a=new ROSLIB.Quaternion({x:m,y:f,z:v,w:S}),a.normalize()}e.origin=new ROSLIB.Pose({position:n,orientation:a})}var R=t.getElementsByTagName("geometry");if(R.length>0){var d=null;for(var g in R[0].childNodes){var O=R[0].childNodes[g];if(1===O.nodeType){d=O;break}}var y=d.nodeName;"sphere"===y?e.geometry=new ROSLIB.UrdfSphere({xml:d}):"box"===y?e.geometry=new ROSLIB.UrdfBox({xml:d}):"cylinder"===y?e.geometry=new ROSLIB.UrdfCylinder({xml:d}):"mesh"===y?e.geometry=new ROSLIB.UrdfMesh({xml:d}):console.warn("Unknown geometry type "+y)}var I=t.getElementsByTagName("material");I.length>0&&(e.material=new ROSLIB.UrdfMaterial({xml:I[0]}))};s(i)};