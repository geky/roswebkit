/**
 * ROSWatch image watcher
 * Copyright (c) 2013-2014, Christopher Haster (MIT License)
 *
 * renders images in realtime
 *
 * params:
 *  quality: quality of compression from 1 to 100
 */

var ROSWatch = (function() {
    function ROSWatch(ros, topic) {
        this.ros = ros
        this.topic = topic

        this.image = new Image()
        this.title = topic
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
