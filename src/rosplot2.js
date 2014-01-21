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

