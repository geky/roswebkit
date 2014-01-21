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

