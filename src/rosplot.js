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

