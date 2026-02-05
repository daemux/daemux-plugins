---
name: nano-banana
description: Generate images using the NanoBanana API powered by Google Gemini
triggers:
  - image
  - generate image
  - create image
  - picture
  - illustration
  - visual
  - artwork
  - photo
  - draw
  - render
hooks:
  Stop:
    - hooks:
        - type: command
          command: "echo '{\"decision\": \"block\", \"reason\": \"Continue with the task after image generation.\"}'"
      once: true
---

# NanoBanana Image Generation

Generate images using the NanoBanana API, which leverages Google Gemini's image generation capabilities.

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key for authentication |
| `NANOBANANA_MODEL` | Model to use (default: `gemini-3-pro-image-preview`) |

### Setup Instructions

You must set the `GEMINI_API_KEY` environment variable in your shell profile before using this skill.

Add the following line to your `~/.zshrc` (macOS/zsh) or `~/.bashrc` (Linux/bash):

```bash
export GEMINI_API_KEY=your-api-key-here
```

Then reload your shell configuration:

```bash
# For zsh
source ~/.zshrc

# For bash
source ~/.bashrc
```

## Usage

### Basic Image Generation

```python
import os
import requests
import base64

def generate_image(prompt: str, output_path: str) -> str:
    """
    Generate an image using NanoBanana/Gemini API.

    Args:
        prompt: Description of the image to generate
        output_path: Path to save the generated image

    Returns:
        Path to the saved image file
    """
    api_key = os.environ["GEMINI_API_KEY"]
    model = os.environ.get("NANOBANANA_MODEL", "gemini-3-pro-image-preview")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    headers = {
        "Content-Type": "application/json",
    }

    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        }
    }

    response = requests.post(
        f"{url}?key={api_key}",
        headers=headers,
        json=payload,
        timeout=60
    )
    response.raise_for_status()

    result = response.json()

    # Extract image data from response
    for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            image_data = base64.b64decode(part["inlineData"]["data"])
            with open(output_path, "wb") as f:
                f.write(image_data)
            return output_path

    raise ValueError("No image data in response")
```

### With Async Support

```python
import os
import httpx
import base64

async def generate_image_async(prompt: str, output_path: str) -> str:
    """
    Generate an image asynchronously using NanoBanana/Gemini API.
    """
    api_key = os.environ["GEMINI_API_KEY"]
    model = os.environ.get("NANOBANANA_MODEL", "gemini-3-pro-image-preview")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        }
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{url}?key={api_key}",
            json=payload
        )
        response.raise_for_status()

        result = response.json()

        for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "inlineData" in part:
                image_data = base64.b64decode(part["inlineData"]["data"])
                with open(output_path, "wb") as f:
                    f.write(image_data)
                return output_path

        raise ValueError("No image data in response")
```

## Prompt Best Practices

### Effective Prompts

```
# Specific and descriptive
"A photorealistic image of a golden retriever playing in autumn leaves,
soft afternoon sunlight, shallow depth of field"

# Style-directed
"Digital art illustration of a futuristic city skyline at sunset,
cyberpunk aesthetic, neon lights reflecting on wet streets"

# Composition-aware
"Product photo of a minimalist white coffee mug on a marble surface,
centered composition, soft shadows, high-key lighting"
```

### Prompt Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| Style | Art style or medium | "oil painting", "digital art", "photorealistic" |
| Lighting | Light conditions | "golden hour", "studio lighting", "dramatic shadows" |
| Composition | Framing and layout | "centered", "rule of thirds", "close-up" |
| Mood | Emotional tone | "peaceful", "dramatic", "whimsical" |

## Error Handling

```python
from requests.exceptions import RequestException

def safe_generate_image(prompt: str, output_path: str) -> str | None:
    """Generate image with proper error handling."""
    try:
        return generate_image(prompt, output_path)
    except KeyError:
        raise EnvironmentError("GEMINI_API_KEY environment variable not set")
    except RequestException as e:
        if e.response is not None:
            if e.response.status_code == 429:
                raise RuntimeError("Rate limit exceeded. Please wait and retry.")
            if e.response.status_code == 400:
                raise ValueError(f"Invalid prompt or request: {e.response.text}")
        raise RuntimeError(f"API request failed: {e}")
    except ValueError as e:
        raise RuntimeError(f"Failed to extract image from response: {e}")
```

## Rate Limits and Quotas

- Default rate limit: 60 requests per minute
- Image generation timeout: 60 seconds recommended
- Maximum prompt length: 4096 characters

## Output Format

```
### Image Generation

| Field | Value |
|-------|-------|
| Prompt | {prompt_text} |
| Model | {NANOBANANA_MODEL} |
| Output | {output_path} |
| Status | SUCCESS / FAILED |

**Result:** Image saved to {output_path}
```
