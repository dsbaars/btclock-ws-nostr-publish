<script setup lang="ts">
    import { inject, ref, onMounted , watch } from 'vue'

    const Module = inject('Module')

    const props = defineProps({
        method: String,
        data: Number,
        params: {
            type: Array,
            default: () => []
        },
    })

    let characters = ref();
    let ret = "LOADING";

    characters.value = [...ret];

    const updateDisplay = () => {
        try {
            ret = Module[props.method](props.data, ...props.params);

            if (ret) {
                characters.value = [...ret];
            } 
        }
        catch (e) {

        }
    }

    watch(props, updateDisplay);
    onMounted(() => {
        updateDisplay()
    });

    const isSplitText = (str: string) => {
		return str.includes('/');
	};
</script>

<template>
    <div class="btclock pure-u-1 pure-u-md-1-3">
        <template v-for="c in characters" >
            <div v-if="isSplitText(c)" class="splitText">
                <div class="flex-items"  v-for="part in c.split('/')">
                    {{ part }}
                </div>
            </div> 
            <div v-else-if="c.length >= 3" class="mediumText">{{  c  }}</div>
            <div v-else-if="c === ' ' || c === ''" class="mediumText">&nbsp;</div>

            <div class="digit" v-else>{{ c }}</div>
        </template>
    </div>
</template>