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

