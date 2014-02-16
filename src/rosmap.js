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

