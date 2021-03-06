import { GEOJSON_TYPES } from 'core/Constants';
import { isNil, isArrayHasData, UID } from 'core/util';
import Coordinate from 'geo/Coordinate';
import Extent from 'geo/Extent';
import { Geometry, GeometryCollection, LineString } from 'geometry';
import Layer from './Layer';
import GeoJSON from 'geometry/GeoJSON';

/**
 * @classdesc
 * Base class of all the layers that can add/remove geometries. <br>
 * It is abstract and not intended to be instantiated.
 * @category layer
 * @abstract
 * @extends Layer
 */
class OverlayLayer extends Layer {

    constructor(id, geometries, options) {
        if (geometries && (!(geometries instanceof Geometry) && !Array.isArray(geometries) && GEOJSON_TYPES.indexOf(geometries.type) < 0)) {
            options = geometries;
            geometries = null;
        }
        super(id, options);
        this._initCache();
        if (geometries) {
            this.addGeometry(geometries);
        }
    }

    /**
     * Get a geometry by its id
     * @param  {String|Number} id   - id of the geometry
     * @return {Geometry}
     */
    getGeometryById(id) {
        if (isNil(id) || id === '') {
            return null;
        }
        if (!this._geoMap[id]) {
            return null;
        }
        return this._geoMap[id];
    }

    /**
     * Get all the geometries or the ones filtered if a filter function is provided.
     * @param {Function} [filter=undefined]  - a function to filter the geometries
     * @param {Object} [context=undefined]   - context of the filter function, value to use as this when executing filter.
     * @return {Geometry[]}
     */
    getGeometries(filter, context) {
        if (!filter) {
            return this._geoList.slice(0);
        }
        const result = [];
        let geometry, filtered;
        for (let i = 0, l = this._geoList.length; i < l; i++) {
            geometry = this._geoList[i];
            if (context) {
                filtered = filter.call(context, geometry);
            } else {
                filtered = filter(geometry);
            }
            if (filtered) {
                result.push(geometry);
            }
        }
        return result;
    }

    /**
     * Get the first geometry, the geometry at the bottom.
     * @return {Geometry} first geometry
     */
    getFirstGeometry() {
        if (!this._geoList.length) {
            return null;
        }
        return this._geoList[0];
    }

    /**
     * Get the last geometry, the geometry on the top
     * @return {Geometry} last geometry
     */
    getLastGeometry() {
        const len = this._geoList.length;
        if (len === 0) {
            return null;
        }
        return this._geoList[len - 1];
    }

    /**
     * Get count of the geometries
     * @return {Number} count
     */
    getCount() {
        return this._geoList.length;
    }

    /**
     * Get extent of all the geometries in the layer, return null if the layer is empty.
     * @return {Extent} - extent of the layer
     */
    getExtent() {
        if (this.getCount() === 0) {
            return null;
        }
        const extent = new Extent();
        this.forEach(g => {
            extent._combine(g.getExtent());
        });
        return extent;
    }

    /**
     * Executes the provided callback once for each geometry present in the layer in order.
     * @param  {Function} fn - a callback function
     * @param  {*} [context=undefined]   - callback's context, value to use as this when executing callback.
     * @return {OverlayLayer} this
     */
    forEach(fn, context) {
        const copyOnWrite = this._geoList.slice(0);
        for (let i = 0, l = copyOnWrite.length; i < l; i++) {
            if (!context) {
                fn(copyOnWrite[i], i);
            } else {
                fn.call(context, copyOnWrite[i], i);
            }
        }
        return this;
    }

    /**
     * Creates a GeometryCollection with all the geometries that pass the test implemented by the provided function.
     * @param  {Function} fn      - Function to test each geometry
     * @param  {*} [context=undefined]  - Function's context, value to use as this when executing function.
     * @return {GeometryCollection} A GeometryCollection with all the geometries that pass the test
     */
    filter() {
        return GeometryCollection.prototype.filter.apply(this, arguments);
    }

    /**
     * Whether the layer is empty.
     * @return {Boolean}
     */
    isEmpty() {
        return !this._geoList.length;
    }

    /**
     * Adds one or more geometries to the layer
     * @param {Geometry|Geometry[]} geometries - one or more geometries
     * @param {Boolean} [fitView=false]  - automatically set the map to a fit center and zoom for the geometries
     * @return {OverlayLayer} this
     */
    addGeometry(geometries, fitView) {
        if (!geometries) {
            return this;
        }
        if (geometries.type === 'FeatureCollection') {
            return this.addGeometry(GeoJSON.toGeometry(geometries), fitView);
        } else if (!Array.isArray(geometries)) {
            const count = arguments.length;
            const last = arguments[count - 1];
            geometries = Array.prototype.slice.call(arguments, 0, count - 1);
            fitView = last;
            if (last instanceof Geometry) {
                geometries.push(last);
                fitView = false;
            }
            return this.addGeometry(geometries, fitView);
        } else if (!isArrayHasData(geometries)) {
            return this;
        }
        this._initCache();
        let fitCounter = 0;
        const centerSum = new Coordinate(0, 0);
        let extent = null;
        for (let i = 0, len = geometries.length; i < len; i++) {
            let geo = geometries[i];
            if (!geo) {
                throw new Error('Invalid geometry to add to layer(' + this.getId() + ') at index:' + i);
            }
            if (!(geo instanceof Geometry)) {
                geo = Geometry.fromJSON(geo);
            }
            const geoId = geo.getId();
            if (!isNil(geoId)) {
                if (!isNil(this._geoMap[geoId])) {
                    throw new Error('Duplicate geometry id in layer(' + this.getId() + '):' + geoId + ', at index:' + i);
                }
                this._geoMap[geoId] = geo;
            }
            const internalId = UID();
            //内部全局唯一的id
            geo._setInternalId(internalId);
            this._geoList.push(geo);


            if (fitView === true) {
                const geoCenter = geo.getCenter();
                const geoExtent = geo.getExtent();
                if (geoCenter && geoExtent) {
                    centerSum._add(geoCenter);
                    if (extent == null) {
                        extent = geoExtent;
                    } else {
                        extent = extent._combine(geoExtent);
                    }
                    fitCounter++;
                }
            }
            if (this.onAddGeometry) {
                this.onAddGeometry(geo);
            }
            geo._bindLayer(this);
            if (geo.onAdd) {
                geo.onAdd();
            }
            /**
             * add event.
             *
             * @event Geometry#add
             * @type {Object}
             * @property {String} type - add
             * @property {Geometry} target - geometry
             * @property {Layer} layer - the layer added to.
             */
            geo._fireEvent('add', {
                'layer': this
            });
        }
        this._sortGeometries();
        const map = this.getMap();
        if (map) {
            this._getRenderer().onGeometryAdd(geometries);
            if (fitView && extent) {
                const z = map.getFitZoom(extent);
                const center = centerSum._multi(1 / fitCounter);
                map.setCenterAndZoom(center, z);
            }
        }
        /**
         * addgeo event.
         *
         * @event OverlayLayer#addgeo
         * @type {Object}
         * @property {String} type - addgeo
         * @property {OverlayLayer} target - layer
         * @property {Geometry[]} geometries - the geometries to add
         */
        this.fire('addgeo', {
            'geometries': geometries
        });
        return this;
    }

    /**
     * Removes one or more geometries from the layer
     * @param  {String|String[]|Geometry|Geometry[]} geometries - geometry ids or geometries to remove
     * @returns {OverlayLayer} this
     */
    removeGeometry(geometries) {
        if (!Array.isArray(geometries)) {
            return this.removeGeometry([geometries]);
        }
        for (let i = geometries.length - 1; i >= 0; i--) {
            if (!(geometries[i] instanceof Geometry)) {
                geometries[i] = this.getGeometryById(geometries[i]);
            }
            if (!geometries[i] || this !== geometries[i].getLayer()) continue;
            geometries[i].remove();
        }
        /**
         * removegeo event.
         *
         * @event OverlayLayer#removegeo
         * @type {Object}
         * @property {String} type - removegeo
         * @property {OverlayLayer} target - layer
         * @property {Geometry[]} geometries - the geometries to remove
         */
        this.fire('removegeo', {
            'geometries': geometries
        });
        return this;
    }

    /**
     * Clear all geometries in this layer
     * @returns {OverlayLayer} this
     */
    clear() {
        this._clearing = true;
        this.forEach(geo => {
            geo.remove();
        });
        this._geoMap = {};
        const old = this._geoList;
        this._geoList = [];
        if (this._getRenderer()) {
            this._getRenderer().onGeometryRemove(old);
        }
        this._clearing = false;
        /**
         * clear event.
         *
         * @event OverlayLayer#clear
         * @type {Object}
         * @property {String} type - clear
         * @property {OverlayLayer} target - layer
         */
        this.fire('clear');
        return this;
    }

    /**
     * Called when geometry is being removed to clear the context concerned.
     * @param  {Geometry} geometry - the geometry instance to remove
     * @protected
     */
    onRemoveGeometry(geometry) {
        if (!geometry || this._clearing) { return; }
        //考察geometry是否属于该图层
        if (this !== geometry.getLayer()) {
            return;
        }
        const internalId = geometry._getInternalId();
        if (isNil(internalId)) {
            return;
        }
        const geoId = geometry.getId();
        if (!isNil(geoId)) {
            delete this._geoMap[geoId];
        }
        const idx = this._findInList(geometry);
        if (idx >= 0) {
            this._geoList.splice(idx, 1);
        }
        if (this._getRenderer()) {
            this._getRenderer().onGeometryRemove([geometry]);
        }
    }

    hide() {
        for (let i = 0, l = this._geoList.length; i < l; i++) {
            this._geoList[i].onHide();
        }
        return Layer.prototype.hide.call(this);
    }

    /**
     * Identify the geometries on the given coordinate
     * @param  {maptalks.Coordinate} coordinate   - coordinate to identify
     * @param  {Object} [options=null]  - options
     * @param  {Object} [options.count=null] - result count
     * @return {Geometry[]} geometries identified
     */
    identify(coordinate, options = {}) {
        const geometries = this._geoList,
            filter = options.filter,
            hits = [];
        const map = this.getMap();
        const point = map.coordinateToPoint(coordinate);
        const cp = map._pointToContainerPoint(point);
        for (let i = geometries.length - 1; i >= 0; i--) {
            const geo = geometries[i];
            if (!geo || !geo.isVisible() || !geo._getPainter()) {
                continue;
            }
            if (!(geo instanceof LineString) || !geo._getArrowStyle()) {
                // Except for LineString with arrows
                const extent = geo._getPainter().getContainerExtent();
                if (!extent || !extent.contains(cp)) {
                    continue;
                }
            }
            if (geo._containsPoint(point) && (!filter || filter(geo))) {
                hits.push(geo);
                if (options['count']) {
                    if (hits.length >= options['count']) {
                        break;
                    }
                }
            }
        }
        return hits;
    }

    _initCache() {
        if (!this._geoList) {
            this._geoList = [];
            this._geoMap = {};
        }
    }

    _sortGeometries() {
        this._geoList.sort((a, b) => {
            return this._compare(a, b);
        });
    }

    _compare(a, b) {
        if (a.getZIndex() === b.getZIndex()) {
            return a._getInternalId() - b._getInternalId();
        }
        return a.getZIndex() - b.getZIndex();
    }

    //binarySearch
    _findInList(geo) {
        const len = this._geoList.length;
        if (len === 0) {
            return -1;
        }
        let low = 0,
            high = len - 1,
            middle;
        while (low <= high) {
            middle = Math.floor((low + high) / 2);
            if (this._geoList[middle] === geo) {
                return middle;
            } else if (this._compare(this._geoList[middle], geo) > 0) {
                high = middle - 1;
            } else {
                low = middle + 1;
            }
        }
        return -1;
    }

    _onGeometryEvent(param) {
        if (!param || !param['target']) {
            return;
        }
        const type = param['type'];
        if (type === 'idchange') {
            this._onGeometryIdChange(param);
        } else if (type === 'zindexchange') {
            this._onGeometryZIndexChange(param);
        } else if (type === 'positionchange') {
            this._onGeometryPositionChange(param);
        } else if (type === 'shapechange') {
            this._onGeometryShapeChange(param);
        } else if (type === 'symbolchange') {
            this._onGeometrySymbolChange(param);
        } else if (type === 'show') {
            this._onGeometryShow(param);
        } else if (type === 'hide') {
            this._onGeometryHide(param);
        } else if (type === 'propertieschange') {
            this._onGeometryPropertiesChange(param);
        }
    }

    _onGeometryIdChange(param) {
        if (param['new'] === param['old']) {
            if (this._geoMap[param['old']] && this._geoMap[param['old']] === param['target']) {
                return;
            }
        }
        if (!isNil(param['new'])) {
            if (this._geoMap[param['new']]) {
                throw new Error('Duplicate geometry id in layer(' + this.getId() + '):' + param['new']);
            }
            this._geoMap[param['new']] = param['target'];
        }
        if (!isNil(param['old']) && param['new'] !== param['old']) {
            delete this._geoMap[param['old']];
        }

    }

    _onGeometryZIndexChange(param) {
        if (param['old'] !== param['new']) {
            this._sortGeometries();
            if (this._getRenderer()) {
                this._getRenderer().onGeometryZIndexChange(param);
            }
        }
    }

    _onGeometryPositionChange(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometryPositionChange(param);
        }
    }

    _onGeometryShapeChange(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometryShapeChange(param);
        }
    }

    _onGeometrySymbolChange(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometrySymbolChange(param);
        }
    }

    _onGeometryShow(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometryShow(param);
        }
    }

    _onGeometryHide(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometryHide(param);
        }
    }

    _onGeometryPropertiesChange(param) {
        if (this._getRenderer()) {
            this._getRenderer().onGeometryPropertiesChange(param);
        }
    }
}

export default OverlayLayer;
