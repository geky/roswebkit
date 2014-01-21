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

