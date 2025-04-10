const fs = require('fs');
const path = require('path');

// Function to inject WhisperKit Swift package into Podfile
function modifyPodfile() {
  const iosPath = path.join(process.cwd(), 'ios');
  const podfilePath = path.join(iosPath, 'Podfile');
  
  // Check if iOS directory and Podfile exist
  if (!fs.existsSync(iosPath) || !fs.existsSync(podfilePath)) {
    console.error('iOS directory or Podfile not found. Run expo prebuild first.');
    return;
  }
  
  // Read Podfile content
  let podfileContent = fs.readFileSync(podfilePath, 'utf8');
  
  // Add WhisperKit Swift Package and our module to the Podfile if not already added
  if (!podfileContent.includes('pod \'WhisperKit\'')) {
    // Find the target line to insert after the use_react_native! block
    const useReactNativePattern = /use_react_native!\([^)]+\)/s;
    const match = podfileContent.match(useReactNativePattern);
    
    if (!match) {
      console.error('Could not find use_react_native! block in Podfile');
      return;
    }
    
    const insertPosition = match.index + match[0].length;
    
    // Get template content
    const templatePath = path.join(__dirname, 'ios', 'Podfile.template.rb');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Insert the template content after the use_react_native! block
    podfileContent = 
      podfileContent.slice(0, insertPosition) + 
      '\n\n  # Added by whisperkit-native install script\n  ' + 
      templateContent.replace(/^/gm, '  ').trim() + 
      '\n\n' +
      podfileContent.slice(insertPosition);
    
    // Write back to Podfile
    fs.writeFileSync(podfilePath, podfileContent);
    console.log('Successfully added WhisperKit to Podfile');
  } else {
    console.log('WhisperKit already in Podfile');
  }
}

// Run the function
modifyPodfile(); 