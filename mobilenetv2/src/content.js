// class name for all text nodes added by this script.
const TEXT_DIV_CLASSNAME = 'tfjs_mobilenet_extension_text'
// Thresholds for LOW_CONFIDENCE_THRESHOLD and HIGH_CONFIDENCE_THRESHOLD,
// controlling which messages are printed.
const HIGH_CONFIDENCE_THRESHOLD = 0.5
const LOW_CONFIDENCE_THRESHOLD = 0.1

function textContentFromPrediction(predictions) {
  if (!predictions || predictions.length < 1) {
    return `No prediction 🙁`
  }
  // Confident.
  if (predictions[0].probability >= HIGH_CONFIDENCE_THRESHOLD) {
    return `${predictions[0].className}`
  }
  // Not Confident.
  if (predictions[0].probability >= LOW_CONFIDENCE_THRESHOLD &&
      predictions[0].probability < HIGH_CONFIDENCE_THRESHOLD) {
    return `${predictions[0].className}?...\n Maybe ${
        predictions[1].className}?`
  }
  // Very not confident.
  if (predictions[0].probability < LOW_CONFIDENCE_THRESHOLD) {
    return `😕  ${predictions[0].className}????...\n Maybe ${
        predictions[1].className}????`
  }
}

function getImageElementsWithSrcUrl(srcUrl) {
  const imgElArr = Array.from(document.getElementsByTagName('img'))
  const filtImgElArr = imgElArr.filter(x => x.src === srcUrl)
  return filtImgElArr
}

function removeTextElements() {
  const textDivs = document.getElementsByClassName(TEXT_DIV_CLASSNAME)
  for (const div of textDivs) {
    div.parentNode.removeChild(div)
  }
}

function addTextElementToImageNode(imgNode, textContent) {
  const originalParent = imgNode.parentElement
  const container = document.createElement('div')
  container.style.position = 'relative'
  container.style.textAlign = 'center'
  container.style.colore = 'white'
  const text = document.createElement('div')
  text.className = 'tfjs_mobilenet_extension_text'
  text.style.position = 'absolute'
  text.style.top = '50%'
  text.style.left = '50%'
  text.style.transform = 'translate(-50%, -50%)'
  text.style.fontSize = '34px'
  text.style.fontFamily = 'Google Sans,sans-serif'
  text.style.fontWeight = '700'
  text.style.color = 'white'
  text.style.lineHeight = '1em'
  text.style['-webkit-text-fill-color'] = 'white'
  text.style['-webkit-text-stroke-width'] = '1px'
  text.style['-webkit-text-stroke-color'] = 'black'
  // Add the containerNode as a peer to the image, right next to the image.
  originalParent.insertBefore(container, imgNode)
  // Move the imageNode to inside the containerNode
  container.appendChild(imgNode)
  // Add the text node right after the image node
  container.appendChild(text)
  text.textContent = textContent
}

// Add a listener to hear from the content.js page when the image is through
// processing.  The message should contin an action, a url, and predictions (the
// output of the classifier)
//
// message: {action, url, predictions}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'IMAGE_CLICK_PROCESSED' && message.url &&
      message.predictions) {
    // Get the list of images with this srcUrl.
    const imgElements = getImageElementsWithSrcUrl(message.url)
    for (const imgNode of imgElements) {
      const textContent = textContentFromPrediction(message.predictions)
      addTextElementToImageNode(imgNode, textContent)
    }
  }
})

window.addEventListener('click', clickHandler, false)

function clickHandler(mouseEvent) {
  if (mouseEvent.button == 0) {
    removeTextElements()
  }
}
