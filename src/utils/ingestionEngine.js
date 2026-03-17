/**
 * OmniAnnotate Ingestion Engine v3
 * High-performance data pipeline for automated asset discovery & structural mapping.
 */

export class IngestionEngine {
  constructor(config = {}) {
    this.onProgress = config.onProgress || (() => {});
    this.supportedImages = config.supportedImages || ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
  }

  /**
   * Main entry point for ingestion.
   * Scans flat or hierarchical file arrays.
   */
  async discover(fileList) {
    const files = Array.from(fileList);
    const manifest = {
      media: [],
      yoloLabels: [],
      cocoLabels: [],
      vocLabels: [],
      classConfigs: []
    };

    let processed = 0;
    const total = files.length;

    for (const file of files) {
      const ext = this._getExt(file.name);
      
      if (this.supportedImages.includes(ext)) {
        manifest.media.push(file);
      } else if (ext === '.txt') {
        if (file.name.toLowerCase() === 'classes.txt') {
          manifest.classConfigs.push(file);
        } else {
          manifest.yoloLabels.push(file);
        }
      } else if (ext === '.json') {
        manifest.cocoLabels.push(file);
      } else if (ext === '.xml') {
        manifest.vocLabels.push(file);
      }

      processed++;
      this.onProgress({ current: processed, total, status: `Scanning: ${file.name}` });
    }

    return manifest;
  }

  /**
   * Reconciles a manifest into a set of project-ready images and annotations.
   */
  async reconcile(manifest, currentClasses = []) {
    this.onProgress({ status: 'Reconciling structural signatures...' });

    // Step 1: Process Images to get dimensions (Parallel)
    const images = await this._processMedia(manifest.media);

    // Step 2: Build Lookup Map for Images (by full path and name)
    const imgLookup = new Map();
    images.forEach((img, idx) => {
      const fullPath = (img.file?.webkitRelativePath || img.name).toLowerCase();
      const baseName = img.name.replace(/\.[^/.]+$/, "").toLowerCase();
      imgLookup.set(fullPath, idx);
      if (!imgLookup.has(baseName)) imgLookup.set(baseName, idx);
    });

    // Step 3: Process Classes from labels (if any)
    let updatedClasses = [...currentClasses];
    const classMap = new Map(updatedClasses.map((c, i) => [c.toLowerCase().trim(), i]));

    if (manifest.classConfigs.length > 0) {
      const classesFile = manifest.classConfigs[0];
      const text = await classesFile.text();
      const newClasses = text.split('\n').map(l => l.trim()).filter(l => l);
      newClasses.forEach(c => {
        const lower = c.toLowerCase();
        if (!classMap.has(lower)) {
          updatedClasses.push(c);
          classMap.set(lower, updatedClasses.length - 1);
        }
      });
    }

    // Step 4: Reconcile YOLO Annotations
    const annotations = {};
    let matchCount = 0;

    for (const labelFile of manifest.yoloLabels) {
      const labelPath = (labelFile.webkitRelativePath || labelFile.name).toLowerCase();
      const labelBase = labelFile.name.replace(/\.[^/.]+$/, "").toLowerCase();

      // Tier 1: Path Heuristic
      const possibleImgPath = labelPath.replace(/[\\\/]labels[\\\/]/i, '/images/').replace(/\.txt$/, '');
      let matchedIdx = -1;

      // Check for path starts with
      for (let [path, idx] of imgLookup.entries()) {
        if (path.startsWith(possibleImgPath)) {
          matchedIdx = idx;
          break;
        }
      }

      // Tier 2: Name Fallback
      if (matchedIdx === -1) {
        matchedIdx = imgLookup.get(labelBase) ?? -1;
      }

      if (matchedIdx !== -1) {
        matchCount++;
        const content = await labelFile.text();
        const rawAnns = this._parseYOLO(content, images[matchedIdx], updatedClasses, classMap);
        annotations[matchedIdx] = [...(annotations[matchedIdx] || []), ...rawAnns];
      }
    }

    return {
      images,
      annotations,
      classes: updatedClasses,
      metrics: {
        imagesIngested: images.length,
        labelsMatched: matchCount
      }
    };
  }

  _getExt(filename) {
    return filename.slice(filename.lastIndexOf('.')).toLowerCase();
  }

  async _processMedia(mediaFiles) {
    const results = [];
    for (const file of mediaFiles) {
      const url = URL.createObjectURL(file);
      const dimensions = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = url;
      });
      results.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url,
        width: dimensions.w,
        height: dimensions.h,
        file
      });
    }
    return results;
  }

  _parseYOLO(content, img, classes, classMap) {
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 5) return null;

        const rawCls = parts[0];
        const coords = parts.slice(1, 5).map(Number);
        if (coords.some(isNaN)) return null;

        let classIdx;
        const classTerm = rawCls.toLowerCase().trim();

        if (isNaN(Number(rawCls))) {
          if (classMap.has(classTerm)) {
            classIdx = classMap.get(classTerm);
          } else {
            classes.push(rawCls);
            classIdx = classes.length - 1;
            classMap.set(classTerm, classIdx);
          }
        } else {
          classIdx = parseInt(rawCls);
        }

        const [xc, yc, w, h] = coords;
        return {
          id: Math.random().toString(36).substr(2, 9),
          type: 'box',
          class: classIdx,
          coords: {
            x: (xc - w / 2) * img.width,
            y: (yc - h / 2) * img.height,
            w: w * img.width,
            h: h * img.height
          }
        };
      }).filter(a => a);
  }
}
