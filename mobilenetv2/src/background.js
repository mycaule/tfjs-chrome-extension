import 'babel-polyfill'
import * as tf from '@tensorflow/tfjs'
import {IMAGENET_CLASSES} from './imagenet_classes'

// Where to load the model from.
const MOBILENET_MODEL_TFHUB_URL =
    'https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/2'
// Size of the image expected by mobilenet.
const IMAGE_SIZE = 224
// The minimum image size to consider classifying.  Below this limit the
// extension will refuse to classify the image.
const MIN_IMG_SIZE = 128

// How many predictions to take.
const TOPK_PREDICTIONS = 2
const FIVE_SECONDS_IN_MS = 5000
/**
 * What action to take when someone clicks the right-click menu option.
 *  Here it takes the url of the right-clicked image and the current tabId
 *  and forwards it to the imageClassifier's analyzeImage method.
 */
function clickMenuCallback(info, tab) {
  imageClassifier.analyzeImage(info.srcUrl, tab.id)
}

/**
 * Adds a right-click menu option to trigger classifying the image.
 * The menu option should only appear when right-clicking an image.
 */
chrome.contextMenus.create({
  title: 'Classify image with TensorFlow.js ',
  contexts: ['image'],
  onclick: clickMenuCallback
})

/**
 * Async loads a mobilenet on construction.  Subsequently handles
 * requests to classify images through the .analyzeImage API.
 * Successful requests will post a chrome message with
 * 'IMAGE_CLICK_PROCESSED' action, which the content.js can
 * hear and use to manipulate the DOM.
 */
class ImageClassifier {
  constructor() {
    this.loadModel()
  }

  async loadModel() {
    console.log('Loading model...')
    const startTime = performance.now()
    try {
      this.model =
          await tf.loadGraphModel(MOBILENET_MODEL_TFHUB_URL, {fromTFHub: true})
      // Warms up the model by causing intermediate tensor values
      // to be built and pushed to GPU.
      tf.tidy(() => {
        this.model.predict(tf.zeros([1, IMAGE_SIZE, IMAGE_SIZE, 3]))
      })
      const totalTime = Math.floor(performance.now() - startTime)
      console.log(`Model loaded and initialized in ${totalTime} ms...`)
    } catch {
      console.error(
          `Unable to load model from URL: ${MOBILENET_MODEL_TFHUB_URL}`)
    }
  }

  async analyzeImage(url, tabId) {
    if (!tabId) {
      console.error('No tab.  No prediction.')
      return
    }
    if (!this.model) {
      console.log('Waiting for model to load...')
      setTimeout(() => {this.analyzeImage(url)}, FIVE_SECONDS_IN_MS)
      return
    }
    let message
    this.loadImage(url).then(
        async (img) => {
          if (!img) {
            console.error(
                'Could not load image.  Either too small or unavailable.')
            return
          }
          const predictions = await this.predict(img)
          message = {action: 'IMAGE_CLICK_PROCESSED', url, predictions}
          chrome.tabs.sendMessage(tabId, message)
        },
        (reason) => {
          console.error(`Failed to analyze: ${reason}`)
        })
  }

  async loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      img.crossOrigin = 'anonymous'
      img.onerror = function(e) {
        reject(`Could not load image from external source ${src}.`)
      }
      img.onload = function(e) {
        if ((img.height && img.height > MIN_IMG_SIZE) ||
            (img.width && img.width > MIN_IMG_SIZE)) {
          img.width = IMAGE_SIZE
          img.height = IMAGE_SIZE
          resolve(img)
        }
        // Fail out if either dimension is less than MIN_IMG_SIZE.
        reject(`Image size too small. [${img.height} x ${
            img.width}] vs. minimum [${MIN_IMG_SIZE} x ${MIN_IMG_SIZE}]`)
      }
      img.src = src
    })
  }

  async getTopKClasses(logits, topK) {
    const {values, indices} = tf.topk(logits, topK, true)
    const valuesArr = await values.data()
    const indicesArr = await indices.data()
    console.log(`indicesArr ${indicesArr}`)
    const topClassesAndProbs = []
    for (let i = 0; i < topK; i++) {
      topClassesAndProbs.push({
        className: IMAGENET_CLASSES[indicesArr[i]],
        probability: valuesArr[i]
      })
    }
    return topClassesAndProbs
  }

  async predict(imgElement) {
    console.log('Predicting...')
    // The first start time includes the time it takes to extract the image
    // from the HTML and preprocess it, in additon to the predict() call.
    const startTime1 = performance.now()
    // The second start time excludes the extraction and preprocessing and
    // includes only the predict() call.
    let startTime2
    const logits = tf.tidy(() => {
      // Mobilenet expects images to be normalized between -1 and 1.
      const img = tf.browser.fromPixels(imgElement).toFloat()
      // const offset = tf.scalar(127.5)
      // const normalized = img.sub(offset).div(offset)
      const normalized = img.div(tf.scalar(256.0))
      const batched = normalized.reshape([1, IMAGE_SIZE, IMAGE_SIZE, 3])
      startTime2 = performance.now()
      const output = this.model.predict(batched)
      if (output.shape[output.shape.length - 1] === 1001) {
        // Remove the very first logit (background noise).
        return output.slice([0, 1], [-1, 1000])
      } else if (output.shape[output.shape.length - 1] === 1000) {
        return output
      } else {
        throw new Error('Unexpected shape...')
      }
    })

    // Convert logits to probabilities and class names.
    const classes = await this.getTopKClasses(logits, TOPK_PREDICTIONS)
    const totalTime1 = performance.now() - startTime1
    const totalTime2 = performance.now() - startTime2
    console.log(
        `Done in ${totalTime1.toFixed(1)} ms ` +
        `(not including preprocessing: ${Math.floor(totalTime2)} ms)`)
    return classes
  }
}

const imageClassifier = new ImageClassifier()
