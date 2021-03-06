import Class from 'core/Class';
import { isNil, isNumber } from 'core/util';
import Eventable from 'core/Eventable';
import JSONAble from 'core/JSONAble';
import Renderable from 'renderer/Renderable';

/**
 * @property {Object}  [options=null] - base options of layer.
 * @property {Number}  [options.minZoom=-1] - the minimum zoom to display the layer, set to -1 to unlimit it.
 * @property {Number}  [options.maxZoom=-1] - the maximum zoom to display the layer, set to -1 to unlimit it.
 * @property {Boolean} [options.visible=true] - whether to display the layer.
 * @property {Number}  [options.opacity=1] - opacity of the layer, from 0 to 1.
 * @property {String}  [options.renderer=canvas] - renderer type, "canvas" in default.
 * @property {Boolean}  [options.drawImmediate=false] - (Only for layer rendered with [CanvasRenderer]{@link renderer.CanvasRenderer}) <br>
 *                                                    In default, for performance reason, layer will be drawn in a frame requested by RAF(RequestAnimationFrame).<br>
 *                                                    Set drawImmediate to true to draw immediately.<br>
 *                                                    This is necessary when layer's drawing is wrapped with another frame requested by RAF.
 * @property {String}   [options.globalCompositeOperation=null] - (Only for layer rendered with [CanvasRenderer]{@link renderer.CanvasRenderer}) globalCompositeOperation of layer's canvas 2d context.
 * @property {Boolean}  [options.debugOutline=false]  - (Only for layer rendered with 2d canvas) An outline with debug information will be drawn with layer.
 * @memberOf Layer
 * @instance
 */
const options = {
    'minZoom': null,
    'maxZoom': null,
    'visible': true,
    'opacity': 1,
    'drawImmediate': false,
    // context.globalCompositeOperation, 'source-in' in default
    'globalCompositeOperation': null,
    'renderer': 'canvas',
    'debugOutline' : false
};

/**
 * @classdesc
 * Base class for all the layers, defines common methods that all the layer classes share. <br>
 * It is abstract and not intended to be instantiated.
 *
 * @category layer
 * @abstract
 * @extends Class
 * @mixes Eventable
 * @mixes JSONAble
 * @mixes Renderable
 */
class Layer extends JSONAble(Eventable(Renderable(Class))) {

    constructor(id, options) {
        super(options);
        this.setId(id);
    }

    /**
     * load the tile layer, can't be overrided by sub-classes
     */
    load() {
        if (!this.getMap()) {
            return this;
        }
        this._initRenderer();
        const zIndex = this.getZIndex();
        if (this.onAdd()) {
            if (!isNil(zIndex)) {
                this._renderer.setZIndex(zIndex);
                if (!this._renderer.isCanvasRender || !this._renderer.isCanvasRender()) {
                    this._renderer.render();
                }
            }
        }
        return this;
    }

    /**
     * Get the layer id
     * @returns {String} id
     */
    getId() {
        return this._id;
    }

    /**
     * Set a new id to the layer
     * @param {String} id - new layer id
     * @return {Layer} this
     * @fires Layer#idchange
     */
    setId(id) {
        const old = this._id;
        if (!isNil(id)) {
            id = id + '';
        }
        this._id = id;
        /**
         * idchange event.
         *
         * @event Layer#idchange
         * @type {Object}
         * @property {String} type - idchange
         * @property {Layer} target    - the layer fires the event
         * @property {String} old        - value of the old id
         * @property {String} new        - value of the new id
         */
        this.fire('idchange', {
            'old': old,
            'new': id
        });
        return this;
    }

    /**
     * Adds itself to a map.
     * @param {Map} map - map added to
     * @return {Layer} this
     */
    addTo(map) {
        map.addLayer(this);
        return this;
    }

    /**
     * Set a z-index to the layer
     * @param {Number} zIndex - layer's z-index
     * @return {Layer} this
     */
    setZIndex(zIndex) {
        this._zIndex = zIndex;
        if (this.map) {
            this.map._sortLayersByZIndex();
        }
        if (this._renderer) {
            this._renderer.setZIndex(zIndex);
        }
        return this;
    }

    /**
     * Get the layer's z-index
     * @return {Number}
     */
    getZIndex() {
        return this._zIndex;
    }

    /**
     * If the layer is rendered by HTML5 Canvas 2d.
     * @return {Boolean}
     * @protected
     */
    isCanvasRender() {
        const renderer = this._getRenderer();
        if (renderer) {
            if (!renderer.isCanvasRender) {
                return false;
            }
            return renderer.isCanvasRender();
        }
        return false;
    }

    /**
     * Get the map that the layer added to
     * @returns {Map}
     */
    getMap() {
        if (this.map) {
            return this.map;
        }
        return null;
    }


    /**
     * Brings the layer to the top of all the layers
     * @returns {Layer} this
     */
    bringToFront() {
        const layers = this._getLayerList();
        if (!layers.length) {
            return this;
        }
        const topLayer = layers[layers.length - 1];
        if (layers.length === 1 || topLayer === this) {
            return this;
        }
        const max = topLayer.getZIndex();
        this.setZIndex(max + 1);
        return this;
    }

    /**
     * Brings the layer under the bottom of all the layers
     * @returns {Layer} this
     */
    bringToBack() {
        const layers = this._getLayerList();
        if (!layers.length) {
            return this;
        }
        const bottomLayer = layers[0];
        if (layers.length === 1 || bottomLayer === this) {
            return this;
        }
        const min = bottomLayer.getZIndex();
        this.setZIndex(min - 1);
        return this;
    }

    /**
     * Show the layer
     * @returns {Layer} this
     */
    show() {
        if (!this.options['visible']) {
            this.options['visible'] = true;

            if (this._getRenderer()) {
                this._getRenderer().show();
            }

            const map = this.getMap();
            if (map) {
                //fire show at renderend to make sure layer is shown
                map.once('renderend', () => {
                    this.fire('show');
                });
            } else {
                this.fire('show');
            }
        }
        return this;
    }

    /**
     * Hide the layer
     * @returns {Layer} this
     */
    hide() {
        if (this.options['visible']) {
            this.options['visible'] = false;
            if (this._getRenderer()) {
                this._getRenderer().hide();
            }

            const map = this.getMap();
            if (map) {
                //fire hide at renderend to make sure layer is hidden
                map.once('renderend', () => {
                    this.fire('hide');
                });
            } else {
                this.fire('hide');
            }
        }
        // this.fire('hide');
        return this;
    }

    /**
     * Whether the layer is visible now.
     * @return {Boolean}
     */
    isVisible() {
        if (isNumber(this.options['opacity']) && this.options['opacity'] <= 0) {
            return false;
        }
        const map = this.getMap();
        if (map) {
            const zoom = map.getZoom();
            if ((!isNil(this.options['maxZoom']) && this.options['maxZoom'] < zoom) ||
                (!isNil(this.options['minZoom']) && this.options['minZoom'] > zoom)) {
                return false;
            }
        }

        if (isNil(this.options['visible'])) {
            this.options['visible'] = true;
        }
        return this.options['visible'];
    }

    /**
     * Remove itself from the map added to.
     * @returns {Layer} this
     */
    remove() {
        if (this.map) {
            this.map.removeLayer(this);
        }
        return this;
    }

    /**
     * Get the mask geometry of the layer
     * @return {Geometry}
     */
    getMask() {
        return this._mask;
    }

    /**
     * Set a mask geometry on the layer, only the area in the mask will be displayed.
     * @param {Geometry} mask - mask geometry, can only be a Marker with vector symbol, a Polygon or a MultiPolygon
     * @returns {Layer} this
     */
    setMask(mask) {
        if (!((mask.type === 'Point' && mask._isVectorMarker()) || mask.type === 'Polygon')) {
            throw new Error('Mask for a layer must be a marker with vector marker symbol, a Polygon or a MultiPolygon.');
        }

        if (!this.isCanvasRender()) {
            throw new Error('Only canvas layers can setMask');
        }
        if (mask.type === 'Point') {
            mask.updateSymbol({
                'markerLineColor': 'rgba(0, 0, 0, 0)',
                'markerFillOpacity': 0
            });
        } else {
            mask.setSymbol({
                'lineColor': 'rgba(0, 0, 0, 0)',
                'polygonOpacity': 0
            });
        }
        mask._bindLayer(this);
        this._mask = mask;
        if (!this.getMap() || this.getMap().isZooming()) {
            return this;
        }
        const renderer = this._getRenderer();
        if (renderer && renderer.setToRedraw) {
            this._getRenderer().setToRedraw();
        }
        return this;
    }

    /**
     * Remove the mask
     * @returns {Layer} this
     */
    removeMask() {
        delete this._mask;
        if (!this.getMap() || this.getMap().isZooming()) {
            return this;
        }
        const renderer = this._getRenderer();
        if (renderer && renderer.setToRedraw) {
            this._getRenderer().setToRedraw();
        }
        return this;
    }

    /**
     * Prepare Layer's loading, this is a method intended to be overrided by subclasses.
     * @return {Boolean} true to continue loading, false to cease.
     * @protected
     */
    onAdd() {
        return true;
    }

    /**
     * Whether the layer is loaded
     * @return {Boolean}
     */
    isLoaded() {
        return !!this._loaded;
    }

    _bindMap(map, zIndex) {
        if (!map) {
            return;
        }
        this.map = map;
        this.setZIndex(zIndex);
        this._switchEvents('on', this);

        this.fire('add');
    }

    _initRenderer() {
        const renderer = this.options['renderer'];
        if (!this.constructor.getRendererClass) {
            return;
        }
        const clazz = this.constructor.getRendererClass(renderer);
        if (!clazz) {
            throw new Error('Invalid renderer for Layer(' + this.getId() + '):' + renderer);
        }
        this._renderer = new clazz(this);
        this._renderer.layer = this;
        this._renderer.setZIndex(this.getZIndex());
        this._switchEvents('on', this._renderer);
    }

    _doRemove() {
        this._loaded = false;
        if (this.onRemove) {
            this.onRemove();
        }
        this._switchEvents('off', this);
        if (this._renderer) {
            this._switchEvents('off', this._renderer);
            this._renderer.remove();
            delete this._renderer;
        }
        delete this._mask;
        delete this.map;
    }

    _switchEvents(to, emitter) {
        if (emitter && emitter.getEvents) {
            this.getMap()[to](emitter.getEvents(), emitter);
        }
    }

    _getRenderer() {
        return this._renderer;
    }

    _getLayerList() {
        if (!this.map) {
            return [];
        }
        return this.map._layers;
    }
}

Layer.mergeOptions(options);

const fire = Layer.prototype.fire;

Layer.prototype.fire = function (eventType, param) {
    if (eventType === 'layerload') {
        this._loaded = true;
    }
    if (this.map) {
        if (!param) {
            param = {};
        }
        param['type'] = eventType;
        param['target'] = this;
        this.map._onLayerEvent(param);
    }
    return fire.apply(this, arguments);
};

export default Layer;
