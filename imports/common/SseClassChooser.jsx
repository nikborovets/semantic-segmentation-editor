import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseClassChooser extends SseToolbar {

    constructor(props) {
        super();
        this.pendingState.counters = {};
        this.classesSets = props.classesSets;
        this.classesSetByName = new Map();
        this.classesSets.map(cset => {
            this.classesSetByName.set(cset.name, cset);
        });
        this.state = {
            counters: {},
            soc: null,
            activeClassIndex: 0,
            mode: null,
            schemaDescriptors: null,
            diffData: null,
            pendingSetChange: null,
            setError: null,
        };
    }

    _validateSet(soc) {
        if (!soc.labels.has('background')) {
            return {valid: false, error: `Set "${soc.name}" is missing required label "background".`};
        }
        if (!soc.labels.has('orphan')) {
            return {valid: false, error: `Set "${soc.name}" is missing required label "orphan".`};
        }
        return {valid: true};
    }

    _diffSchema(liveSocConfig, labelSchema) {
        const liveByLabel = new Map(liveSocConfig.objects.map(o => [o.label, o]));
        const activeSchemaObjs = labelSchema.objects.filter(o => o.status === 'active');
        const schemaByLabel = new Map(activeSchemaObjs.map(o => [o.label, o]));
        const added = [], removed = [], changed = [];
        for (const [label, liveObj] of liveByLabel) {
            if (!schemaByLabel.has(label)) {
                added.push({label, color: liveObj.color});
            } else {
                const so = schemaByLabel.get(label);
                if ((liveObj.color || '') !== (so.color || '')) {
                    changed.push({label, fromColor: so.color, toColor: liveObj.color});
                }
            }
        }
        for (const [label] of schemaByLabel) {
            if (!liveByLabel.has(label)) removed.push(label);
        }
        return {added, removed, changed};
    }

    getIcon(objDesc) {
        if (objDesc && MDI[objDesc.icon]) {
            const Comp = MDI[objDesc.icon];
            return <Comp/>;
        }
        return <MDI.Label/>;
    }

    messages() {
        this.onMsg("classSelection", (arg) => {
            this.setState({activeClassIndex: arg.descriptor.classIndex});
        });

        this.onMsg("classIndex-select", (arg) => {
            this.setState({activeClassIndex: arg.value});
        });

        this.onMsg("class-instance-count", arg => {
            this.pendingState.counters[arg.classIndex] = arg.count;
            this.invalidate();
        });

        this.onMsg("editor-ready", (arg) => {
            const socName = arg && arg.socName;
            const labelSchema = arg && arg.labelSchema;

            if (!socName) {
                this.setState({mode: 'required-set-chooser', setError: null});
                return;
            }

            const soc = this.classesSetByName.get(socName);
            if (!soc) {
                this.setState({
                    mode: 'required-set-chooser',
                    setError: `Set "${socName}" is no longer in settings. Please choose a new set.`
                });
                return;
            }

            const validation = this._validateSet(soc);
            if (!validation.valid) {
                this.setState({mode: 'required-set-chooser', setError: validation.error});
                return;
            }

            if (!labelSchema) {
                // Mongo record exists with socName but no schema = legacy cloud
                this.setState({soc, mode: 'legacy-error', setError: null});
                return;
            }

            const diff = this._diffSchema(soc._config, labelSchema);
            if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
                this.setState({
                    soc,
                    mode: 'schema-diff',
                    diffData: {...diff, pendingLabelSchema: labelSchema, pendingLiveSoc: soc}
                });
            } else {
                this.setState({soc, mode: null});
                this.sendMsg("active-soc", {value: soc, labelSchema});
            }
        });

        this.onMsg("active-soc", (arg) => {
            this.soc = arg.value;
            this.displayAll();
        });

        this.onMsg("active-schema-descriptors", (arg) => {
            this.setState({schemaDescriptors: arg.value, counters: {}});
            this.pendingState.counters = {};
        });
    }

    displayAll() {
        if (this.state) {
            Object.keys(this.state).forEach(k => {
                if (k.toString().startsWith("mute") || k.toString().startsWith("solo")) {
                    delete this.state[k];
                }
            });
        }
    }

    toggleButton(prop, idx) {
        const o = {};
        const p = this.state[prop + idx] || false;
        o[prop + idx] = !p;
        this.setState(o);
    }

    muteOrSolo(name, argument, idx) {
        if (this.state.counters[argument.classIndex] ||
            (!this.state.counters[argument.classIndex] && this.state[name + idx])) {
            this.toggleButton(name, idx);
            this.sendMsg(name, argument);
        }
    }

    _pickSetFromChooser(setName) {
        const soc = this.classesSetByName.get(setName);
        if (!soc) return;
        const validation = this._validateSet(soc);
        if (!validation.valid) {
            this.setState({setError: validation.error});
            return;
        }
        if (this.state.mode === 'required-set-chooser') {
            this.setState({soc, mode: null, setError: null, activeClassIndex: 0, counters: {}, schemaDescriptors: null});
            this.pendingState.counters = {};
            this.sendMsg("active-soc", {value: soc, labelSchema: null});
        } else {
            this.setState({mode: 'set-change-warning', pendingSetChange: setName});
        }
    }

    _confirmSetChange() {
        const name = this.state.pendingSetChange;
        const newSoc = this.classesSetByName.get(name);
        if (!newSoc) return;
        const validation = this._validateSet(newSoc);
        if (!validation.valid) {
            this.setState({mode: null, pendingSetChange: null});
            this.sendMsg("alert", {variant: "error", message: validation.error});
            return;
        }
        this.setState({soc: newSoc, mode: null, pendingSetChange: null, activeClassIndex: 0, counters: {}, schemaDescriptors: null});
        this.pendingState.counters = {};
        this.sendMsg("active-soc", {value: newSoc, labelSchema: null, resetSet: true});
    }

    initSetChange() {
        this.setState({mode: "set-chooser"});
    }

    shouldComponentUpdate(np, ns) {
        if (this.state.mode == "set-chooser" && ns.mode == "normal")
            this.sendMsg("dismiss-not-enough-classes");
        return true;
    }

    _renderRequiredSetChooser() {
        const {setError} = this.state;
        return (
            <Dialog open={true}>
                <DialogTitle>Choose a Set of Object Classes</DialogTitle>
                <DialogContent>
                    <div className="vflex">
                        {setError && (
                            <span style={{color: '#f44336', marginBottom: 8}}>{setError}</span>
                        )}
                        <span>Select a labeling set to start annotating:</span>
                        <div className="hflex w100 wrap" style={{marginTop: 8}}>
                            {this.classesSets.map((cset) => {
                                const v = this._validateSet(cset);
                                return (
                                    <Button
                                        key={cset.name}
                                        disabled={!v.valid}
                                        title={v.valid ? '' : v.error}
                                        onClick={() => this._pickSetFromChooser(cset.name)}>
                                        {cset.name}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    _renderLegacyError() {
        const {soc} = this.state;
        return (
            <Dialog open={true}>
                <DialogTitle>No Label Schema</DialogTitle>
                <DialogContent>
                    <div className="vflex" style={{gap: 8}}>
                        <span>
                            This cloud was annotated before label schema pinning was introduced and
                            has no schema record. The meaning of stored indices cannot be verified.
                        </span>
                        <span>
                            <strong>Recommended:</strong> re-export your labels from a previous version and
                            re-import into a fresh cloud.
                        </span>
                        <span style={{color: '#ff9800'}}>
                            <strong>Escape hatch:</strong> you can create a schema from the current
                            settings, but stored indices may already have wrong semantics.
                        </span>
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button
                        color="secondary"
                        onClick={() => {
                            this.setState({mode: null});
                            this.sendMsg("active-soc", {value: soc, labelSchema: null, forceCreateSchema: true});
                        }}>
                        Create schema from current settings
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    _renderSetChooserDialog() {
        const {soc} = this.state;
        return (
            <Dialog open={true}>
                <DialogTitle>Sets of Object Classes</DialogTitle>
                <DialogContent>
                    <div className="vflex">
                        <span>Choose which set to use:</span>
                        <div className="hflex w100 wrap">
                            {this.classesSets.map((cset) => {
                                const v = this._validateSet(cset);
                                return (
                                    <Button
                                        key={cset.name}
                                        disabled={!v.valid}
                                        title={v.valid ? '' : v.error}
                                        onClick={() => this._pickSetFromChooser(cset.name)}>
                                        {cset.name + (soc && cset.name === soc.name ? " (current)" : "")}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => this.setState({mode: null})} color="primary">Cancel</Button>
                </DialogActions>
            </Dialog>
        );
    }

    _renderSetChangeWarningDialog() {
        const {pendingSetChange} = this.state;
        return (
            <Dialog open={true}>
                <DialogTitle>Change Class Set</DialogTitle>
                <DialogContent>
                    <div className="vflex" style={{gap: 6}}>
                        <span>
                            Changing to <strong>{pendingSetChange}</strong> will reset all current
                            labels and objects for this cloud to <em>background</em>.
                        </span>
                        <span style={{color: '#ff9800'}}>This cannot be undone. Continue?</span>
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => this.setState({mode: null, pendingSetChange: null})}>Cancel</Button>
                    <Button onClick={() => this._confirmSetChange()} color="secondary">Reset and Change</Button>
                </DialogActions>
            </Dialog>
        );
    }

    _renderSchemaDiffDialog() {
        const {diffData} = this.state;
        if (!diffData) return null;
        const {added, removed, changed, pendingLabelSchema, pendingLiveSoc} = diffData;
        return (
            <Dialog open={true} maxWidth="sm" fullWidth>
                <DialogTitle>Label Schema Updated</DialogTitle>
                <DialogContent>
                    <div className="vflex" style={{gap: 8}}>
                        <span>The settings for <strong>{pendingLiveSoc && pendingLiveSoc.name}</strong> have changed since your last session:</span>
                        {added.length > 0 && (
                            <div>
                                <strong>Added labels:</strong>
                                {added.map(a => (
                                    <div key={a.label} style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 2}}>
                                        <span style={{width: 14, height: 14, background: a.color, display: 'inline-block', border: '1px solid #888', flexShrink: 0}}/>
                                        {a.label}
                                    </div>
                                ))}
                            </div>
                        )}
                        {removed.length > 0 && (
                            <div>
                                <strong>Removed labels</strong> (points will be reassigned to <em>orphan</em>):
                                {removed.map(r => <div key={r} style={{marginTop: 2}}>{r}</div>)}
                            </div>
                        )}
                        {changed.length > 0 && (
                            <div>
                                <strong>Color changes:</strong>
                                {changed.map(c => (
                                    <div key={c.label} style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 2}}>
                                        <span style={{width: 14, height: 14, background: c.fromColor, display: 'inline-block', border: '1px solid #888', flexShrink: 0}}/>
                                        <span>→</span>
                                        <span style={{width: 14, height: 14, background: c.toColor, display: 'inline-block', border: '1px solid #888', flexShrink: 0}}/>
                                        {c.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button
                        color="primary"
                        onClick={() => {
                            const {pendingLabelSchema: schema, pendingLiveSoc: liveSoc} = this.state.diffData;
                            this.setState({soc: liveSoc, mode: null, diffData: null, activeClassIndex: 0, schemaDescriptors: null});
                            this.pendingState.counters = {};
                            this.sendMsg("active-soc", {value: liveSoc, labelSchema: schema, needsSync: true});
                        }}>
                        OK
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    render() {
        const {mode, soc, schemaDescriptors} = this.state;
        const smallIconStyle = {width: "25px", height: "25px", color: "darkgray"};
        const smallIconSelected = {width: "25px", height: "25px", color: "red"};
        const displayDescriptors = schemaDescriptors || (soc ? soc.descriptors : []);

        return (
            <div className="sse-class-chooser vflex scroller"
                 style={{"backgroundColor": "#393536", "padding": "5px 5px 0 0"}}>
                {displayDescriptors.map((objDesc, idx) => {
                    if (objDesc.status === 'orphaned') return null;
                    const isSelected = objDesc.classIndex == this.state.activeClassIndex;
                    return (
                        <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}>
                            <ChevronRight className="chevron" color={isSelected ? "primary" : "disabled"}/>
                            <Button className="class-button"
                                    onDoubleClick={() => this.sendMsg("class-multi-select", {name: objDesc.label})}
                                    onClick={() => this.sendMsg('classSelection', {descriptor: objDesc})}
                                    style={{
                                        "width": "100%",
                                        "minHeight": "20px",
                                        "margin": "1px",
                                        "backgroundColor": objDesc.color,
                                        "color": SseGlobals.computeTextColor(objDesc.color),
                                        "border": isSelected ? "solid 1px #E53935" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                                <div className="hflex flex-align-items-center w100">
                                    {this.getIcon(objDesc)}{objDesc.label}
                                </div>
                                <sup>{this.state.counters[objDesc.classIndex] > 0 ? this.state.counters[objDesc.classIndex] : ""}</sup>
                            </Button>
                            {this.props.mode == "3d" ?
                                <div className="hflex">
                                    <IconButton
                                        onClick={() => this.muteOrSolo("mute", objDesc, idx)}
                                        style={this.state["mute" + idx] ? smallIconSelected : smallIconStyle}>
                                        <EyeOff/>
                                    </IconButton>
                                    <IconButton
                                        onClick={() => this.muteOrSolo("solo", objDesc, idx)}
                                        style={this.state["solo" + idx] ? smallIconSelected : smallIconStyle}>
                                        <Eye/>
                                    </IconButton>
                                </div> : null}
                        </div>
                    );
                })}
                {soc && <Button onClick={() => this.initSetChange()}>Classes Sets</Button>}
                {mode === 'required-set-chooser' && this._renderRequiredSetChooser()}
                {mode === 'legacy-error' && this._renderLegacyError()}
                {mode === 'set-chooser' && this._renderSetChooserDialog()}
                {mode === 'set-change-warning' && this._renderSetChangeWarningDialog()}
                {mode === 'schema-diff' && this._renderSchemaDiffDialog()}
            </div>
        );
    }
}
